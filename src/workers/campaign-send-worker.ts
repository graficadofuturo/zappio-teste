import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import { sendMessage } from '../../whatsappService.js';

let db: any;

try {
  let config: any = {};
  if (fs.existsSync('./firebase-applet-config.json')) {
    config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  }

  if (!(getApps() || []).length) {
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
        console.error('[SendWorker] Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format:', e);
      }
    }
  }

  if ((getApps() || []).length) {
    const dbId = config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)' 
      ? config.firestoreDatabaseId 
      : undefined;
    db = getFirestore(getApps()[0], dbId);
  }
} catch (e) {
  console.error('[SendWorker] Initialization failed:', e);
}

export function startCampaignSendWorker() {
  if (!db) {
    console.error('[SendWorker] Cannot start: DB not initialized');
    return;
  }
  console.log('[SendWorker] Started');

  setInterval(async () => {
    try {
      // Find pending jobs
      const jobsRef = db.collection('campaign_send_jobs');
      const snapshot = await jobsRef
        .where('status', '==', 'pending')
        .limit(10)
        .get();

      if (snapshot.empty) return;

      for (const doc of snapshot.docs) {
        const job = doc.data();
        const jobId = doc.id;

        // Mark as processing
        await doc.ref.update({
            status: 'processing',
            updatedAt: FieldValue.serverTimestamp()
        });

        console.log(`[SendWorker] Processing job ${jobId} for campaign ${job.campaignId}`);

        try {
            // Check provider
            const provider = process.env.WHATSAPP_PROVIDER || 'baileys';
            
            if (provider === 'mock') {
                console.log(`[SendWorker] MOCK SEND: ${job.targetPhoneOrGroupId}`);
                // Mock success
            } else {
                // Actually send using baileys
                let jid = job.targetPhoneOrGroupId;
                if (!jid.includes('@')) {
                    jid = `${jid}@s.whatsapp.net`;
                }

                await sendMessage(job.instanceId, jid, job.finalMessage, job.imageUrl);
            }

            // Success
            await doc.ref.update({
                status: 'sent',
                sentAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });

            // Log
            await db.collection('campaign_send_logs').add({
                campaignId: job.campaignId,
                jobId: jobId,
                userId: job.userId,
                instanceId: job.instanceId,
                targetId: job.targetId,
                targetPhoneOrGroupId: job.targetPhoneOrGroupId,
                status: 'success',
                messagePreview: job.finalMessage.substring(0, 50),
                providerResponse: 'OK',
                errorCode: null,
                errorMessage: null,
                createdAt: FieldValue.serverTimestamp()
            });

            // Update campaign partially sent
            await updateCampaignStatusIfNeeded(job.campaignId);

        } catch (error: any) {
            console.error(`[SendWorker] Job ${jobId} failed:`, error.message);
            const attempts = (job.attempts || 0) + 1;
            
            const isNoConnection = error.message.includes('Instance not connected') || error.message.includes('não conectada') || error.message.includes('No WhatsApp connection');

            const nextStatus = (attempts >= 3 || isNoConnection) ? 'failed' : 'pending';

            await doc.ref.update({
                status: nextStatus,
                attempts: attempts,
                errorCode: isNoConnection ? 'WHATSAPP_INSTANCE_NOT_CONNECTED' : 'SEND_ERROR',
                errorMessage: error.message,
                updatedAt: FieldValue.serverTimestamp()
            });

            await db.collection('campaign_send_logs').add({
                campaignId: job.campaignId,
                jobId: jobId,
                userId: job.userId,
                instanceId: job.instanceId,
                targetId: job.targetId,
                targetPhoneOrGroupId: job.targetPhoneOrGroupId,
                status: 'error',
                messagePreview: job.finalMessage.substring(0, 50),
                providerResponse: null,
                errorCode: isNoConnection ? 'WHATSAPP_INSTANCE_NOT_CONNECTED' : 'SEND_ERROR',
                errorMessage: error.message,
                createdAt: FieldValue.serverTimestamp()
            });

            await updateCampaignStatusIfNeeded(job.campaignId);
        }
      }
    } catch (e) {
      console.error('[SendWorker] Polling error:', e);
    }
  }, 15000); // 15 seconds polling to conserve Firestore free quota
}

async function updateCampaignStatusIfNeeded(campaignId: string) {
    try {
        const jobsRef = db.collection('campaign_send_jobs').where('campaignId', '==', campaignId);
        const snapshot = await jobsRef.get();
        if (snapshot.empty) return;

        let total = snapshot.size;
        let sent = 0;
        let failed = 0;
        let pending = 0;

        snapshot.docs.forEach(d => {
            const s = d.data().status;
            if (s === 'sent') sent++;
            else if (s === 'failed') failed++;
            else pending++;
        });

        const campaignRef = db.collection('campaigns').doc(campaignId);
        
        // Only update if not scheduled continuous mode
        const campSnap = await campaignRef.get();
        if (!campSnap.exists) return;
        const cData = campSnap.data();

        if (cData?.trigger_type === 'auto' || cData?.auto_send_now) {
            // Leave it auto
            return;
        }

        let newStatus = 'queued';
        if (pending > 0 && sent > 0) newStatus = 'sending';
        else if (pending === 0 && failed === total) newStatus = 'failed';
        else if (pending === 0 && sent === total) newStatus = 'sent';
        else if (pending === 0 && failed > 0 && sent > 0) newStatus = 'partially_sent';

        if (newStatus !== cData!.status) {
            await campaignRef.update({
                status: newStatus,
                updatedAt: FieldValue.serverTimestamp()
            });
        }
    } catch (e) {}
}
