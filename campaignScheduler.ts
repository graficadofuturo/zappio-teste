import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import { sendMessage } from './whatsappService.js';
import { resolveProductLinkForSending } from './src/api/campaignService.js';
import { convertToAffiliateLink } from './api_handlers/_lib/ml-utils.js';
import { validateCampaignLinksBeforeSending, replaceOriginalLinksWithAffiliateLinks, resolveCampaignMessageBeforeSending } from './src/lib/affiliate/affiliate-resolver.js';
import { getAdminDb } from './src/api/firebaseAdmin.js';

let db: any;

try {
  db = getAdminDb();
} catch (e) {
  console.error('[Scheduler] Initialization failed:', e);
}

export async function checkAndTriggerCampaigns(dbInstance: any) {
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
    const campaignsRef = dbInstance.collection('campaigns');
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
             // Check scheduled_days constraint (if configured)
             const autoDays = camp.scheduled_days || [];
             if (autoDays.length > 0 && !autoDays.includes(currentDay)) {
                continue; // Not scheduled for today
             }

             // Check scheduled_times constraint (if configured)
             const autoTimes = camp.scheduled_times || [];
             if (autoTimes.length > 0) {
                // Build a time window: only allow sending during configured hours
                // For each scheduled time HH:MM, allow sending within that minute
                const isInTimeWindow = autoTimes.some((t: string) => t === currentTimeStr);
                if (!isInTimeWindow) {
                   continue; // Not in any of the scheduled time windows
                }
             }

             const parts = camp.send_interval.split(':');
             const m = parseInt(parts[0], 10) || 0;
             const s = parseInt(parts[1], 10) || 0;
             const intervalMs = (m * 60 + s) * 1000;
             
             const lastRun = camp.last_run?.toDate?.() || new Date(0);
             const diffMs = now.getTime() - lastRun.getTime();
             
             if (diffMs >= intervalMs && intervalMs > 0) {
               await triggerCampaign(campaignDoc, camp, id, dbInstance);
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

          await triggerCampaign(campaignDoc, camp, id, dbInstance);
        }
      }
    }
  } catch (e) {
    console.error('[Scheduler] Poll error:', e);
  }
}

export function startScheduler() {
  if (!db) {
    console.error('[Scheduler] Cannot start: DB not initialized (Missing Service Account)');
    return;
  }
  console.log('[Scheduler] Started with Firebase Admin');

  // Run every 30 seconds
  setInterval(async () => {
    await checkAndTriggerCampaigns(db);
  }, 30000); // 30 seconds polling to conserve Firestore free quota
}

async function triggerCampaign(campaignDoc: any, camp: any, id: string, dbInstance?: any) {
    const activeDb = dbInstance || db;
    console.log(`[Scheduler] Triggering campaign: ${camp.name} (${id})`);
    
    function normalizeTarget(target: any, campaignInstanceId: string) {
        if (!target) return null;
        
        let jid = '';
        let instId = campaignInstanceId;

        if (typeof target === 'string') {
            jid = target;
        } else {
            jid = target.jid || target.id || target.group_id || target.value || target.remoteJid;
            if (target.instance_id) instId = target.instance_id;
        }

        if (!jid) return null;
        
        // Clean jid if it contains instanceId prefix
        if (instId && jid.startsWith(`${instId}_`)) {
            jid = jid.replace(`${instId}_`, '');
        }

        return {
            instance_id: String(instId),
            jid: String(jid),
            original: target
        };
    }

    try {
        await campaignDoc.ref.update({
          status: 'sending',
          last_run: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp()
        });

        const campaignInstanceId = camp.instance_id || '';
        const rawTargets = camp.targets || camp.selectedTargets || camp.groups || camp.target_group_id || [];
        const targets = (Array.isArray(rawTargets) ? rawTargets : [rawTargets])
            .map(t => normalizeTarget(t, campaignInstanceId))
            .filter(Boolean);

        console.log(`[Scheduler] CAMPAIGN_SEND_TARGETS_NORMALIZED`, {
            campaignId: id,
            rawTargets,
            targets
        });

        if (targets.length === 0) {
            console.error(`[Scheduler] INVALID_TARGET_SKIPPED`, { campaignId: id, rawTargets });
            await campaignDoc.ref.update({
                status: 'error',
                last_run_message: 'Nenhum alvo válido encontrado para disparo.',
                updated_at: FieldValue.serverTimestamp()
            });
            return;
        }

        let messageText = camp.message || '';
        let matchedProduct: any = null;
        let finalImageUrl = camp.image_url || '';
        // Real Product Handling
        if (camp.use_ml_products || camp.offer_category) {
            try {
                let allProds: any[] = [];
                
                // Fetch directly from offer_bank based on category and marketplace
                const marketplaceOrig = camp.offer_marketplace && camp.offer_marketplace !== 'all' ? camp.offer_marketplace : 'all';
                const queryMarketplace = marketplaceOrig === 'mercadolivre_global' ? 'mercadolivre' : marketplaceOrig;
                
                let query = activeDb.collection('offer_bank').where('status', '==', 'active');
                if (queryMarketplace && queryMarketplace !== 'all') {
                    query = query.where('marketplace', '==', queryMarketplace);
                }
                
                const category = camp.offer_category || 'Todos';
                if (category && category !== 'Todos' && category !== 'todos') {
                    query = query.where('category', '==', category);
                }
                
                const prodsSnap = await query.limit(100).get();
                allProds = prodsSnap.docs.filter((d: any) => d && d.id && typeof d.data === 'function').map((d: any) => ({
                    id: d.id,
                    ...(d.data() || {})
                }));
                allProds.sort((a: any, b: any) => {
                    const timeA = a.updatedAt?.toDate?.()?.getTime() || a.updatedAt || 0;
                    const timeB = b.updatedAt?.toDate?.()?.getTime() || b.updatedAt || 0;
                    return timeB - timeA;
                });

                // Get Sent History for this campaign
                const sentHistorySnap = await activeDb.collection('campaign_sent_products')
                                                .where('campaignId', '==', id)
                                                .get();
                const sentProductIds = new Set(sentHistorySnap.docs.filter((d: any) => d && typeof d.data === 'function' && d.data())
                                                                  .map((d: any) => d.data().marketplaceProductId)
                                                                  .filter(Boolean));

                // Select unsent product
                const availableProds = allProds.filter((p: any) => {
                     if (!p) return false;
                     const pId = p.productId || p.marketplaceProductId || p.id;
                     if (!pId) return false;
                     const hasRequired = (p.title || p.titleShort) && p.price && (p.productUrl || p.affiliateUrl);
                     return hasRequired && !sentProductIds.has(pId);
                });

                if (availableProds.length === 0) {
                   console.log(`[Scheduler] Campaign ${id} exhausted all products. Resetting cycle...`);
                   // Clear sent history to reset cycle
                   const batch = activeDb.batch();
                   sentHistorySnap.docs.forEach((d: any) => {
                       if (d && d.ref) batch.delete(d.ref);
                   });
                   await batch.commit();

                   matchedProduct = allProds.filter((p: any) => {
                       if (!p) return false;
                       const hasRequired = (p.title || p.titleShort) && p.price && (p.productUrl || p.affiliateUrl);
                       return hasRequired;
                   })[0]; // just grab first
                   
                   if (!matchedProduct) {
                       await campaignDoc.ref.update({
                          status: 'paused',
                          last_run_message: 'Nenhum produto válido encontrado no banco de ofertas.',
                          updated_at: FieldValue.serverTimestamp()
                       });
                       return; // Skip send
                   }
                } else {
                   matchedProduct = availableProds[Math.floor(Math.random() * availableProds.length)];
                }

                if (!matchedProduct) {
                     throw new Error("Produto não selecionado corretamente após filtragem.");
                }

                const anyProd = matchedProduct as any;
                const pId = anyProd.productId || anyProd.marketplaceProductId || anyProd.id;
                if (!pId) {
                     console.error(`[Scheduler] Campaign ${id} - CRITICAL: matchedProduct has no ID:`, matchedProduct);
                     throw new Error("Produto selecionado sem identificador válido.");
                }

                // Record reservation immediately
                try {
                    await activeDb.doc(`campaign_sent_products/${id}_${pId}`).set({
                        campaignId: id,
                        marketplace: anyProd.marketplace || 'mercadolivre',
                        marketplaceProductId: pId,
                        title: anyProd.title || anyProd.titleShort || '',
                        productUrl: anyProd.productUrl || '',
                        affiliateUrl: anyProd.affiliateUrl || anyProd.productUrl || '',
                        sentAt: FieldValue.serverTimestamp(),
                        recipientId: (targets && targets[0] && targets[0].jid) || 'unknown',
                        status: 'sent'
                    });
                } catch (resErr) {
                    console.error(`[Scheduler] Campaign ${id} - Reservation error:`, resErr);
                }

                // Replace standard variables
                const prod = anyProd;
                const marketplaceDisplay = (prod.marketplace === 'mercadolivre' || prod.marketplace === 'mercadolivre_global') ? 'Mercado Livre' : (prod.marketplace === 'shopee' ? 'Shopee' : (prod.marketplace || ''));

                messageText = messageText.replace(/{category}/gi, prod.category || 'Geral');
                messageText = messageText.replace(/{marketplace}/gi, marketplaceDisplay);
                messageText = messageText.replace(/{product_title}/gi, prod.titleShort || prod.title || '');
                messageText = messageText.replace(/{product_tittle}/gi, prod.titleShort || prod.title || ''); 
                
                const priceVal = prod.price || 0;
                const priceStr = priceVal ? `R$ ${Number(priceVal).toFixed(2).replace('.', ',')}` : '';
                messageText = messageText.replace(/{product_price}/gi, priceStr);

                const numPriceVal = Number(priceVal);
                const numOldPriceVal = Number(prod.originalPrice);
                const isOldPriceValid = prod.originalPrice && !isNaN(numOldPriceVal) && numOldPriceVal > 0 && numOldPriceVal > numPriceVal;

                if (!isOldPriceValid) {
                    messageText = messageText.split('\n').filter((l: string) => !l.includes('{product_old_price}')).join('\n');
                } else {
                    const oldPriceStr = `~R$ ${numOldPriceVal.toFixed(2).replace('.', ',')}~`;
                    messageText = messageText.replace(/{product_old_price}/gi, oldPriceStr);
                }

                if (!prod.discountPercent || String(prod.discountPercent) === '0') {
                    messageText = messageText.split('\n').filter((l: string) => !l.includes('{discountPercent}')).join('\n');
                } else {
                    messageText = messageText.replace(/{discountPercent}/gi, String(prod.discountPercent).replace('% OFF', ''));
                }

                if (!prod.couponCode && !prod.cupom && !prod.product_coupon) {
                     messageText = messageText.split('\n').filter((l: string) => !l.includes('{product_cupom}') && !l.includes('{product_coupon}')).join('\n');
                } else {
                     const couponStr = String(prod.couponCode || prod.cupom || prod.product_coupon || '');
                     messageText = messageText.replace(/{product_cupom}/gi, couponStr);
                     messageText = messageText.replace(/{product_coupon}/gi, couponStr);
                }
                
                const userId = camp.userId || camp.user_id || camp.ownerId || camp.uid || '';
                
                // First, replace any {product_link} variables with the original URL 
                const originalUrl = prod.productUrl || prod.url || prod.permalink || prod.product_original_link || prod.affiliateUrl || '';
                messageText = messageText.replace(/{product_link}/gi, originalUrl);
                messageText = messageText.replace(/{product_affiliate_link}/gi, originalUrl);

                // Clean up unreplaced variables safely
                messageText = messageText.replace(/\{[a-zA-Z0-9_]+\}/g, '');
                
                // Clean up empty lines created by removing lines
                const cleanLines = messageText.split('\n').map((l: string) => l.trimRight());
                messageText = cleanLines.join('\n').replace(/\n{3,}/g, '\n\n'); 

                if (!finalImageUrl) {
                    finalImageUrl = prod.imageUrl || prod.image || prod.thumbnail || '';
                }
            } catch (prodErr: any) {
                console.error(`[Scheduler] Campaign ${id} - Error preparing product:`, prodErr);
                throw new Error(`Erro ao preparar produto: ${prodErr.message}`);
            }
        } else if (messageText.includes('{{')) {
            // Legacy/Dummy variables fallback for old campaigns
            messageText = messageText.replace(/{{[^{}]+}}/g, '');
        }

        let errors: string[] = [];

        if (messageText && messageText.trim().length > 0) {
            const userId = camp.userId || camp.user_id || camp.ownerId || camp.uid || '';
            const { canSend, finalMessage, reasons } = await resolveCampaignMessageBeforeSending({ ...camp, message: messageText }, userId);
            
            if (!canSend) {
                await campaignDoc.ref.update({
                  status: 'needs_manual_action',
                  last_run_message: reasons.join(' | '),
                  updated_at: FieldValue.serverTimestamp()
                });
                console.log(`[Scheduler] Campaign ${id} blocked: ${reasons.join(' | ')}`);
                return;
            }
            
            // Replace with the final transformed message
            messageText = finalMessage;

            for (const target of targets) {
                const instId = target.instance_id;
                const jid = target.jid;
                
                if (!instId || !jid) {
                    console.error(`[Scheduler] INVALID_TARGET_SKIPPED`, { campaignId: id, target });
                    continue;
                }
                
                try {
                    // Create Job instead of direct send
                    await activeDb.collection('campaign_send_jobs').add({
                      campaignId: id,
                      userId: userId, // from above
                      instanceId: instId,
                      targetId: jid,
                      targetType: jid.includes('@g.us') ? 'group' : 'contact',
                      targetName: target.original?.name || jid,
                      targetPhoneOrGroupId: jid,
                      originalMessage: camp.message || '',
                      finalMessage: messageText,
                      imageUrl: finalImageUrl || '',
                      status: 'pending',
                      attempts: 0,
                      errorCode: null,
                      errorMessage: null,
                      createdAt: FieldValue.serverTimestamp(),
                      updatedAt: FieldValue.serverTimestamp(),
                      sentAt: null
                    });
                } catch(e: any) {
                    console.error(`[Scheduler] Erro ao enfileirar para o alvo ${instId}/${jid}:`, e?.message || e);
                    errors.push(e?.message || "Erro desconhecido ao enfileirar");
                }
            }
        }

        if (errors.length > 0) {
            throw new Error(`Erros (parciais ao enfileirar): ${errors.join(', ')}`);
        }

        if (camp.is_recurring || camp.trigger_type === 'auto') {
          await campaignDoc.ref.update({
            status: 'scheduled',
            updated_at: FieldValue.serverTimestamp()
          });
        } else {
          // Status becomes queued, worker handles the rest
          await campaignDoc.ref.update({
            status: 'queued',
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
