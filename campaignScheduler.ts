import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import { sendMessage } from './whatsappService.ts';

let db: any;

try {
  let config: any = {};
  if (fs.existsSync('./firebase-applet-config.json')) {
    config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  }

  if (!getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        initializeApp({
          credential: cert(serviceAccount),
          projectId: config.projectId,
        });
      } catch (e) {
        console.error('[Scheduler] Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format:', e);
      }
    } else {
      console.warn('[Scheduler] WARNING: FIREBASE_SERVICE_ACCOUNT_KEY is not set. Scheduler will not run.');
      // We don't initialize admin to prevent ADC errors
    }
  }

  if (getApps().length) {
    const dbId = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)' 
      ? config.firestoreDatabaseId 
      : undefined;
    db = getFirestore(getApps()[0], dbId);
  }
} catch (e) {
  console.error('[Scheduler] Initialization failed:', e);
}

export function startScheduler() {
  if (!db) {
    console.error('[Scheduler] Cannot start: DB not initialized (Missing Service Account)');
    return;
  }
  console.log('[Scheduler] Started with Firebase Admin');

  
  // Run every 2 seconds
  setInterval(async () => {
    const now = new Date();
    // Offset for Brazil/Sao Paulo explicitly to avoid Vercel/VPS timezone issues
    const brTimeStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const brDate = new Date(brTimeStr);
    
    const currentDay = brDate.getDay(); // 0-6
    const curHH = String(brDate.getHours()).padStart(2, '0');
    const curMM = String(brDate.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${curHH}:${curMM}`;
    
    const yyyy = brDate.getFullYear();
    const mm = String(brDate.getMonth() + 1).padStart(2, '0');
    const dd = String(brDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD

    try {
      const campaignsRef = db.collection('campaigns');
      const snapshot = await campaignsRef
        .where('trigger_type', 'in', ['scheduled', 'auto'])
        .where('status', '==', 'scheduled')
        .get();

      if (snapshot.empty) return;

      for (const campaignDoc of snapshot.docs) {
        const camp = campaignDoc.data();
        const id = campaignDoc.id;

        if (camp.trigger_type === 'auto') {
            if (camp.auto_send_now && camp.send_interval) {
               const parts = camp.send_interval.split(':');
               const m = parseInt(parts[0], 10) || 0;
               const s = parseInt(parts[1], 10) || 0;
               const intervalMs = (m * 60 + s) * 1000;
               
               const lastRun = camp.last_run?.toDate?.() || new Date(0);
               const diffMs = now.getTime() - lastRun.getTime();
               
               if (diffMs >= intervalMs && intervalMs > 0) {
                 await triggerCampaign(campaignDoc, camp, id);
               }
            }
            continue;
        }

        const scheduledDays = camp.scheduled_days || [];
        const scheduledDates = camp.scheduled_dates || [];
        const isScheduledToday = scheduledDays.includes(currentDay) || scheduledDates.includes(todayStr);

        if (isScheduledToday) {
          const scheduledTimes = camp.scheduled_times || [];
          if (scheduledTimes.includes(currentTimeStr)) {
            
            const lastRun = camp.last_run?.toDate?.() || new Date(0);
            const diffMs = now.getTime() - lastRun.getTime();
            if (diffMs < 55000) {
                continue;
            }

            await triggerCampaign(campaignDoc, camp, id);
          }
        }
      }
    } catch (e) {
      console.error('[Scheduler] Poll error:', e);
    }
  }, 2000);
}

async function triggerCampaign(campaignDoc: any, camp: any, id: string) {
    console.log(`[Scheduler] Triggering campaign: ${camp.name} (${id})`);
    try {
        await campaignDoc.ref.update({
          status: 'sending',
          last_run: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp()
        });

        const targetList = (camp.targets && camp.targets.length > 0) 
            ? camp.targets 
            : [{ instance_id: camp.instance_id, group_id: camp.target_group_id }];

        let messageText = camp.message || '';
        let matchedProduct: any = null;
        let finalImageUrl = camp.image_url || '';

        // Real Product Handling
        if (camp.use_ml_products || camp.offer_category) {
            let allProds: any[] = [];
            
            // Fetch directly from offer_bank based on category and marketplace
            const marketplace = camp.offer_marketplace && camp.offer_marketplace !== 'all' ? camp.offer_marketplace : 'mercadolivre';
            let query = db.collection('offer_bank').where('marketplace', '==', marketplace);
            
            if (camp.offer_category && camp.offer_category !== 'todos') {
                query = query.where('category', '==', camp.offer_category);
            }
            
            const prodsSnap = await query.get();
            allProds = prodsSnap.docs.map((d: any) => ({
                id: d.id,
                ...d.data()
            }));

            // Get Sent History for this campaign
            const sentHistorySnap = await db.collection('campaign_sent_products')
                                            .where('campaignId', '==', id)
                                            .get();
            const sentProductIds = new Set(sentHistorySnap.docs.map((d: any) => d.data().marketplaceProductId));

            // Select unsent product
            const availableProds = allProds.filter((p: any) => !sentProductIds.has(p.marketplaceProductId));

            if (availableProds.length === 0) {
               console.log(`[Scheduler] Campaign ${id} exhausted all products.`);
               await campaignDoc.ref.update({
                  status: 'paused',
                  last_run_message: 'Todos os produtos disponíveis já foram enviados nesta campanha.',
                  updated_at: FieldValue.serverTimestamp()
               });
               return; // Skip send
            }

            matchedProduct = availableProds[Math.floor(Math.random() * availableProds.length)];

            // Record reservation immediately
            await db.doc(`campaign_sent_products/${id}_${matchedProduct.marketplaceProductId}`).set({
                campaignId: id,
                marketplace: matchedProduct.marketplace,
                marketplaceProductId: matchedProduct.marketplaceProductId,
                title: matchedProduct.title,
                productUrl: matchedProduct.productUrl,
                affiliateUrl: matchedProduct.affiliateUrl,
                sentAt: FieldValue.serverTimestamp(),
                recipientId: targetList[0]?.group_id || 'unknown',
                status: 'sent'
            });

            // Replace standard variables
            const prod = matchedProduct;
            
            // Handle optional elements manually if template is used:
            messageText = messageText.replace(/{Category}/g, prod.category || '');
            messageText = messageText.replace(/{Marketplace}/g, prod.marketplace === 'mercadolivre' ? 'Mercado Livre' : prod.marketplace);
            messageText = messageText.replace(/{Product_Name}/g, prod.title || '');
            
            const priceStr = prod.price ? `R$ ${Number(prod.price).toFixed(2).replace('.', ',')}` : '';
            messageText = messageText.replace(/{Product_Price}/g, priceStr);
            
            if (messageText.includes('🚫 De: {Product_Old_Price}') && !prod.originalPrice) {
               messageText = messageText.replace(/🚫 De: \{Product_Old_Price\}\n?/g, '');
            } else {
               const oldPriceStr = prod.originalPrice ? `R$ ${Number(prod.originalPrice).toFixed(2).replace('.', ',')}` : '';
                 messageText = messageText.replace(/{Product_Old_Price}/g, oldPriceStr);
            }
            
            const linkStr = prod.affiliateUrl || prod.productUrl || '';
            messageText = messageText.replace(/{Product_Affiliate_Link}/g, linkStr);
            
            // Clean up unreplaced variables and empty lines
            const lines = messageText.split('\n');
            const cleanLines = lines.map((l: string) => l.replace(/{[^{}]+}/g, '').trim()).filter((l: string) => l !== '');
            messageText = cleanLines.join('\n');

            if (!finalImageUrl) {
                finalImageUrl = prod.image || prod.thumbnail || '';
                if (!finalImageUrl) {
                    console.log(`[Scheduler] Product ${prod.marketplaceProductId} has no image, sending text only.`);
                }
            }
        } else if (messageText.includes('{{')) {
            // Legacy/Dummy variables fallback for old campaigns
            messageText = messageText.replace(/{{[^{}]+}}/g, '');
        }

        let errors: string[] = [];
        if (messageText.trim().length > 0) {
            for (const target of targetList) {
                const jid = target.group_id.replace(`${target.instance_id}_`, '');
                try {
                    await sendMessage(target.instance_id, jid, messageText, finalImageUrl);
                } catch(e: any) {
                    console.error(`[Scheduler] Error sending for target ${target.instance_id}/${jid}:`, e);
                    errors.push(e.message);
                }
            }
        }

        if (errors.length > 0) {
            throw new Error(`Erros (parciais): ${errors.join(', ')}`);
        }

        if (camp.is_recurring || camp.trigger_type === 'auto') {
          await campaignDoc.ref.update({
            status: 'scheduled',
            updated_at: FieldValue.serverTimestamp()
          });
        } else {
          await campaignDoc.ref.update({
            status: 'sent',
            updated_at: FieldValue.serverTimestamp()
          });
        }
        console.log(`[Scheduler] Success: ${camp.name}`);

    } catch (e: any) {
        console.error(`[Scheduler] Error triggering ${id}:`, e);
        const isConnectionError = e.message && (e.message.includes('Instance not connected') || e.message.includes('não conectada'));
        
        await campaignDoc.ref.update({
          status: isConnectionError ? 'paused' : 'failed',
          updated_at: FieldValue.serverTimestamp()
        });
    }
}
