import { Router } from "express";

const router = Router();

router.get("/status", async (req, res) => {
  const { instanceId } = req.query;
  if (!instanceId || typeof instanceId !== 'string') {
    return res.status(400).json({ error: "instanceId is required" });
  }
  const { instanceStatus } = await import("../../../whatsappService.ts");
  const status = instanceStatus.get(instanceId) || { status: 'disconnected' };
  res.json(status);
});

router.get("/sync", async (req, res) => {
  const { instanceId } = req.query;
  if (!instanceId || typeof instanceId !== 'string') return res.status(400).json({ error: "instanceId is required" });
  const { instanceStatus } = await import("../../../whatsappService.ts");
  const status = instanceStatus.get(instanceId);
  if (!status) return res.status(404).json({ error: "not found" });
  
  // Actively fetch groups if connected
  const { fetchGroupsSafely } = await import("../../../whatsappService.ts");
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
  const { connectWhatsApp } = await import("../../../whatsappService.ts");
  const status = await connectWhatsApp(instanceId);
  res.json(status);
});

router.post("/disconnect", async (req, res) => {
  const { instanceId } = req.body;
  if (!instanceId) return res.status(400).json({ error: "instanceId is required" });
  const { disconnectWhatsApp } = await import("../../../whatsappService.ts");
  await disconnectWhatsApp(instanceId);
  res.json({ success: true });
});

router.post("/send", async (req, res) => {
  const { instanceId, to, message, image_url } = req.body;
  if (!instanceId || !to || !message) {
    return res.status(400).json({ error: "instanceId, to, and message are required" });
  }
  const { sendMessage } = await import("../../../whatsappService.ts");
  try {
    await sendMessage(instanceId, to, message, image_url);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to send message" });
  }
});

export default router;
