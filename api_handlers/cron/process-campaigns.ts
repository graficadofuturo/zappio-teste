import { getAdminDb } from "../_lib/firebase-admin.js";
import { checkAndTriggerCampaigns } from "../../campaignScheduler.js";
import { processPendingSendJobs } from "../../src/workers/campaign-send-worker.js";

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // Auth check for cron
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error("[Cron Campaign] Unauthorized access attempt");
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  console.log("[Cron Campaign] Starting scheduler and send-worker processing...");

  try {
    const db = getAdminDb();
    
    // 1. Check campaigns to run and queue jobs if due
    await checkAndTriggerCampaigns(db);
    
    // 2. Process any pending campaign send jobs in queue
    await processPendingSendJobs(db);

    console.log("[Cron Campaign] Processing tick completed successfully");

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("[Cron Campaign] Critical execution failure:", error);
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
}
