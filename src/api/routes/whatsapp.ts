import { Router } from "express";
import { getAdminDb } from "../../api/firebaseAdmin.js";

const router = Router();

// Helper: save instance status to Firestore
async function saveStatusToFirestore(instanceId: string, data: Record<string, any>) {
  try {
    const db = getAdminDb();
    await db.doc(`whatsapp_instances/${instanceId}`).set(data, { merge: true });
  } catch (e) {
    console.error("[WA-ROUTE] Failed to save status to Firestore:", e);
  }
}

router.get("/status", async (req, res) => {
  const { instanceId } = req.query;
  if (!instanceId || typeof instanceId !== 'string') {
    return res.status(400).json({ error: "instanceId is required" });
  }

  const { instanceStatus } = await import("../../../whatsappService.js");
  const memStatus = instanceStatus.get(instanceId);

  if (memStatus) {
    return res.json(memStatus);
  }

  // Fallback: Check if session credentials exist (either locally or in Firestore)
  try {
    const db = getAdminDb();
    const sessionSnap = await db.collection("whatsapp_sessions").doc(instanceId).get();
    
    // Check local creds
    const fs = await import("fs");
    const path = await import("path");
    const authDir = process.env.VERCEL ? `/tmp/baileys_auth_info_${instanceId}` : `baileys_auth_info_${instanceId}`;
    const localCredsExists = fs.existsSync(path.join(authDir, 'creds.json'));

    if (sessionSnap.exists || localCredsExists) {
      console.log(`[WA-ROUTE] Session exists in database or disk for ${instanceId}. Returning connected.`);
      
      // Best-effort background reconnect (warm up the socket in memory)
      const { connectWhatsApp } = await import("../../../whatsappService.js");
      connectWhatsApp(instanceId).catch(err => console.error(`[WA-ROUTE] Background connect failed:`, err));

      return res.json({
        status: 'connected',
        qr: null,
        groups: [],
        contacts: []
      });
    } else {
      // Credentials do not exist, so it is disconnected. Clean up the status in Firestore as well.
      await saveStatusToFirestore(instanceId, { wa_status: 'disconnected', wa_qr: null, status: 'disconnected' });
      return res.json({
        status: 'disconnected',
        qr: null,
        groups: [],
        contacts: []
      });
    }
  } catch (e) {
    console.error("[WA-ROUTE] Error in status check:", e);
  }

  return res.json({ status: 'disconnected', groups: [], contacts: [] });
});

router.get("/sync", async (req, res) => {
  const { instanceId } = req.query;
  if (!instanceId || typeof instanceId !== 'string') return res.status(400).json({ error: "instanceId is required" });
  
  const { instanceStatus, connectWhatsApp, fetchGroupsSafely } = await import("../../../whatsappService.js");
  let status = instanceStatus.get(instanceId);

  if (!status) {
    // Check if we can auto-reconnect
    try {
      const db = getAdminDb();
      const sessionSnap = await db.collection("whatsapp_sessions").doc(instanceId).get();
      const fs = await import("fs");
      const path = await import("path");
      const authDir = process.env.VERCEL ? `/tmp/baileys_auth_info_${instanceId}` : `baileys_auth_info_${instanceId}`;
      const localCredsExists = fs.existsSync(path.join(authDir, 'creds.json'));

      if (sessionSnap.exists || localCredsExists) {
        console.log(`[WA-ROUTE] Auto-reconnect triggered via /sync for instance ${instanceId}`);
        await connectWhatsApp(instanceId);
        
        // Wait for connection to establish
        let attempts = 0;
        const maxAttempts = 30; // 15 seconds
        while (attempts < maxAttempts) {
          const current = instanceStatus.get(instanceId);
          if (current && current.status === 'connected') {
            break;
          }
          if (current && (current.status === 'error' || current.status === 'qrcode' || current.status === 'disconnected')) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        status = instanceStatus.get(instanceId);
      }
    } catch (e) {
      console.error("[WA-ROUTE] Error auto-reconnecting on /sync:", e);
    }
  }

  if (!status) return res.status(404).json({ error: "not found" });
  
  if (status.status === 'connected') {
    await fetchGroupsSafely(instanceId, true); // force fetch
  }
  
  res.json({
    groups: status.groups || [],
    contacts: status.contacts || []
  });
});

router.post("/connect", async (req, res) => {
  const { instanceId } = req.body;
  if (!instanceId) return res.status(400).json({ error: "instanceId is required" });

  // Mark as initializing in Firestore immediately
  await saveStatusToFirestore(instanceId, {
    wa_status: 'initializing',
    wa_qr: null,
    wa_qr_updated_at: null,
  });

  const { connectWhatsApp, instanceStatus } = await import("../../../whatsappService.js");

  // Hook into status updates to persist QR + connected state in Firestore
  const pushUpdates = setInterval(async () => {
    const cur = instanceStatus.get(instanceId);
    if (!cur) return;
    const update: Record<string, any> = { wa_status: cur.status };
    if (cur.qr) {
      update.wa_qr = cur.qr;
      update.wa_qr_updated_at = new Date().toISOString();
    }
    if (cur.status === 'connected') {
      update.wa_qr = null; // clear QR when connected
      update.status = 'connected';
      clearInterval(pushUpdates);
    }
    await saveStatusToFirestore(instanceId, update);
  }, 1500);

  // Stop pushing after 5 minutes (QR expires)
  setTimeout(() => clearInterval(pushUpdates), 5 * 60 * 1000);

  const status = await connectWhatsApp(instanceId);
  if (status && status.status === 'error') {
    clearInterval(pushUpdates);
    return res.status(500).json({ status: 'error', error: (status as any).error });
  }

  // Block/wait until we get a QR code or connected state, or up to 15 seconds
  let attempts = 0;
  const maxAttempts = 30; // 15 seconds
  while (attempts < maxAttempts) {
    const cur = instanceStatus.get(instanceId);
    if (cur && (cur.status === 'qrcode' || cur.status === 'connected' || cur.status === 'error')) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }

  clearInterval(pushUpdates);

  const finalStatus = instanceStatus.get(instanceId) || { status: 'initializing' };
  res.json(finalStatus);
});

router.post("/disconnect", async (req, res) => {
  const { instanceId } = req.body;
  if (!instanceId) return res.status(400).json({ error: "instanceId is required" });
  const { disconnectWhatsApp } = await import("../../../whatsappService.js");
  await disconnectWhatsApp(instanceId);
  await saveStatusToFirestore(instanceId, { wa_status: 'disconnected', wa_qr: null, status: 'disconnected' });
  res.json({ success: true });
});

router.post("/send", async (req, res) => {
  const { instanceId, to, message, image_url } = req.body;
  if (!instanceId || !to || !message) {
    return res.status(400).json({ error: "instanceId, to, and message are required" });
  }
  const { sendMessage } = await import("../../../whatsappService.js");
  try {
    await sendMessage(instanceId, to, message, image_url);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to send message" });
  }
});

export default router;

