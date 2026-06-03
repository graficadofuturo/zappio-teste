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

  // Fallback: read from Firestore (handles cold serverless starts)
  try {
    const db = getAdminDb();
    const snap = await db.doc(`whatsapp_instances/${instanceId}`).get();
    if (snap.exists) {
      const data = snap.data() as any;
      return res.json({
        status: data.wa_status || 'disconnected',
        qr: data.wa_qr || null,
      });
    }
  } catch (e) {}

  return res.json({ status: 'disconnected' });
});

router.get("/sync", async (req, res) => {
  const { instanceId } = req.query;
  if (!instanceId || typeof instanceId !== 'string') return res.status(400).json({ error: "instanceId is required" });
  const { instanceStatus, fetchGroupsSafely } = await import("../../../whatsappService.js");
  const status = instanceStatus.get(instanceId);
  if (!status) return res.status(404).json({ error: "not found" });
  
  if (status.status === 'connected') {
    await fetchGroupsSafely(instanceId);
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
  // We poll the in-memory status briefly to push updates to Firestore
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
  res.json(status || { status: 'initializing' });
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

