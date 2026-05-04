import { getAdminDb } from "../_lib/firebase-admin.js";
import { simplifyProductTitle } from "../_lib/ml-utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const db = getAdminDb();
    console.log("BACKFILL_TITLES_START: Fetching documents to update...");
    
    // We fetch all documents. For a production app we might want to do this in batches.
    const snapshot = await db.collection("offer_bank").get();
    let updateCount = 0;
    const batchSize = 100;
    let currentBatch = db.batch();
    let currentBatchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const originalTitle = data.titleOriginal || data.title;
      const currentShort = data.titleShort;
      const newShort = simplifyProductTitle(originalTitle);

      // Only update if titleShort is missing or different
      if (!currentShort || currentShort !== newShort || !data.titleOriginal || data.title !== newShort) {
        currentBatch.update(doc.ref, {
          title: newShort,
          titleShort: newShort,
          titleOriginal: originalTitle,
          updatedAt: new Date().toISOString()
        });
        
        updateCount++;
        currentBatchCount++;

        if (currentBatchCount >= batchSize) {
          await currentBatch.commit();
          currentBatch = db.batch();
          currentBatchCount = 0;
        }
      }
    }

    if (currentBatchCount > 0) {
      await currentBatch.commit();
    }

    console.log(`BACKFILL_TITLES_SUCCESS: Updated ${updateCount} items`);
    return res.status(200).json({
      ok: true,
      message: `Updated ${updateCount} offers with simplified titles.`,
      updateCount
    });

  } catch (error) {
    console.error("BACKFILL_TITLES_ERR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
