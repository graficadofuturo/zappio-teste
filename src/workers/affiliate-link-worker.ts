import "dotenv/config";
import { adminDb } from "../lib/affiliate/firebase-admin";
import { AffiliateLinkConverter } from "../lib/affiliate/converter";
import { AffiliateLinkJob } from "../lib/affiliate/job-service";

async function runWorker() {
  if (!adminDb) {
    console.warn("[Affiliate Worker] Firebase Admin DB not initialized. Worker disabled.");
    return;
  }
  console.log("[Affiliate Worker] Started checking for jobs...");

  while (true) {
    try {
      // 1. Fetch pending jobs
      const jobsSnapshot = await adminDb
        .collection("affiliate_link_jobs")
        .where("status", "==", "pending")
        .orderBy("createdAt", "asc")
        .limit(5)
        .get();

      if (!jobsSnapshot.empty) {
        const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AffiliateLinkJob));
        console.log(`[Affiliate Worker] Found ${jobs.length} pending jobs.`);

        for (const job of jobs) {
          console.log(`[Affiliate Worker] Processing job ${job.id}`);
          await AffiliateLinkConverter.processJob(job);
        }
      }
    } catch (e: any) {
      if (e.message && e.message.toLowerCase().includes("index")) {
        console.error("[Affiliate Worker] Firestore Index missing. Error details and creation link:\n", e.message);
      } else {
        console.error("[Affiliate Worker] Polling error:", e);
      }
    }
    
    // Sleep for 10 seconds before next poll
    await new Promise(res => setTimeout(res, 10000));
  }
}

// Start worker if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker();
}

export { runWorker };
