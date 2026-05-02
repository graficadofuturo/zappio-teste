import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { sendMessage } from './whatsappService.ts';

let db: any;

try {
  let config: any = {};
  if (fs.existsSync('./firebase-applet-config.json')) {
    config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  }

  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
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

  if (admin.apps.length) {
    const dbId = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)' 
      ? config.firestoreDatabaseId 
      : undefined;
    db = getFirestore(admin.apps[0], dbId);
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
          last_run: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });

        const targetList = (camp.targets && camp.targets.length > 0) 
            ? camp.targets 
            : [{ instance_id: camp.instance_id, group_id: camp.target_group_id }];

        let messageText = camp.message || '';
        let matchedProduct: any = null;
        let finalImageUrl = camp.image_url || '';

        // Real Product Handling
        if (camp.use_ml_products && (messageText.includes('{') || finalImageUrl.includes('{product_image}'))) {
            let allProds: any[] = [];
            
            if (camp.offer_category) {
                // Fetch dynamically using category
                const { getRandomKeyword, fetchMLProductsByKeyword } = await import('./src/api/campaignService.ts');
                const keyword = getRandomKeyword(camp.offer_category);
                const mlResults = await fetchMLProductsByKeyword(keyword);
                allProds = mlResults.map((mlItem: any) => ({
                    id: mlItem.id,
                    external_product_id: mlItem.id,
                    product_title: mlItem.title,
                    product_price: mlItem.price,
                    product_old_price: mlItem.original_price,
                    product_discount: mlItem.original_price && mlItem.price < mlItem.original_price ? Math.round((1 - (mlItem.price / mlItem.original_price)) * 100) + '%' : null,
                    product_link: mlItem.permalink,
                    product_image: mlItem.thumbnail?.replace('-I.jpg', '-O.jpg').replace('-I.webp', '-O.webp') || null,
                    product_category: camp.offer_category
                }));
            } else {
                // Backward compatibility: fetch from DB
                let query = db.collection('products').where('user_id', '==', camp.user_id);
                const prodsSnap = await query.get();
                allProds = prodsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

                if (camp.ml_product_ids && camp.ml_product_ids !== 'ALL') {
                    const allowedIds = new Set(camp.ml_product_ids);
                    allProds = allProds.filter((p: any) => allowedIds.has(p.id));
                }
            }

            // Get Sent History for this campaign
            const historySnap = await db.collection('campaign_product_history')
                                     .where('campaign_id', '==', id)
                                     .get();
            const sentProductIds = new Set(historySnap.docs.map((d: any) => d.data().product_id));

            // Select unsent product
            const availableProds = allProds.filter((p: any) => !sentProductIds.has(p.external_product_id || p.id));

            if (availableProds.length === 0) {
               console.log(`[Scheduler] Campaign ${id} exhausted all products.`);
               await campaignDoc.ref.update({
                  status: 'paused',
                  last_run_message: 'Todos os produtos disponíveis já foram enviados nesta campanha.',
                  updated_at: admin.firestore.FieldValue.serverTimestamp()
               });
               return; // Skip send
            }

            matchedProduct = availableProds[Math.floor(Math.random() * availableProds.length)];

            // Record reservation immediately
            await db.collection('campaign_product_history').add({
                campaign_id: id,
                product_id: matchedProduct.external_product_id || matchedProduct.id,
                product_title: matchedProduct.product_title,
                sent_at: admin.firestore.FieldValue.serverTimestamp(),
                status: 'sent'
            });

            // Replace standard ML variables
            const prod = matchedProduct;
            messageText = messageText.replace(/{product_title}/g, prod.product_title || '');
            messageText = messageText.replace(/{product_price}/g, prod.product_price ? `R$ ${Number(prod.product_price).toFixed(2).replace('.', ',')}` : '');
            messageText = messageText.replace(/{product_old_price}/g, prod.product_old_price ? `~R$ ${Number(prod.product_old_price).toFixed(2).replace('.', ',')}~` : '');
            messageText = messageText.replace(/{product_discount}/g, prod.product_discount || '');
            messageText = messageText.replace(/{product_link}/g, prod.product_link || '');
            messageText = messageText.replace(/{product_affiliate_link}/g, prod.product_affiliate_link || prod.product_link || '');
            messageText = messageText.replace(/{product_image}/g, prod.product_image || '');
            messageText = messageText.replace(/{product_category}/g, prod.product_category || '');
            messageText = messageText.replace(/{product_store}/g, prod.product_store || '');
            messageText = messageText.replace(/{product_stock}/g, prod.product_stock || '');
            messageText = messageText.replace(/{product_id}/g, prod.external_product_id || prod.id || '');
            messageText = messageText.replace(/{product_cupom}/g, prod.product_cupom || '');
            messageText = messageText.replace(/{product_tittle}/g, prod.product_title || '');

            // Clean up unreplaced variables and empty lines
            const lines = messageText.split('\n');
            const cleanLines = lines.map((l: string) => l.replace(/{[^{}]+}/g, '').trim()).filter((l: string) => l !== '');
            messageText = cleanLines.join('\n');

            if (finalImageUrl.includes('{product_image}')) {
                finalImageUrl = finalImageUrl.replace(/{product_image}/g, prod.product_image || '');
            } else if (!finalImageUrl && messageText.includes('{product_image}')) {
                finalImageUrl = prod.product_image || '';
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
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          await campaignDoc.ref.update({
            status: 'sent',
            updated_at: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        console.log(`[Scheduler] Success: ${camp.name}`);

    } catch (e: any) {
        console.error(`[Scheduler] Error triggering ${id}:`, e);
        const isConnectionError = e.message && (e.message.includes('Instance not connected') || e.message.includes('não conectada'));
        
        await campaignDoc.ref.update({
          status: isConnectionError ? 'paused' : 'failed',
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}
