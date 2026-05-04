import { getAdminDb } from "../_lib/firebase-admin.js";
import { scrapeProductPage, saveOffers } from "../_lib/ml-utils.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const db = getAdminDb();
    console.log("REPROCESS_START: Fetching all Mercado Livre offers from offer_bank");
    
    const snapshot = await db.collection("offer_bank")
      .where("marketplace", "==", "mercadolivre")
      .get();
      
    if (snapshot.empty) {
      return res.status(200).json({ ok: true, processed: 0, updated: 0, removed: 0 });
    }

    const offers = [];
    snapshot.forEach(doc => {
      offers.push({ id: doc.id, ...doc.data() });
    });

    console.log(`REPROCESS_ITEMS: Found ${offers.length} items to reprocess`);

    let updated = 0;
    let removed = 0;
    const errors = [];
    const enrichedBatch = [];

    // Process in small sequential batches or one by one to avoid rate limiting/timeout
    // For simplicity and safety in this environment, we'll do them one by one but limit the total to avoid long runs
    const maxToProcess = 20; 
    const toProcess = offers.slice(0, maxToProcess);

    for (const offer of toProcess) {
      const url = offer.productUrl || offer.url || offer.permalink;
      
      if (!url) {
        console.warn(`REPROCESS_SKIPPING: No URL for document ${offer.id}`);
        // Optional: remove if no URL
        // await db.collection("offer_bank").doc(offer.id).delete();
        removed++;
        continue;
      }

      try {
        console.log(`REPROCESS_SCRAPING: ${url}`);
        const enriched = await scrapeProductPage(url, offer.category || 'todos');
        
        if (enriched) {
          enrichedBatch.push(enriched);
          updated++;
        } else {
          console.warn(`REPROCESS_FAILED: Could not enrich ${url}`);
          // If we can't scrape, at least we tried. We don't remove unless it's a 404 perhaps.
        }
      } catch (err) {
        console.error(`REPROCESS_ERROR: ${url}`, err.message);
        errors.push({ id: offer.id, url, error: err.message });
      }
    }

    if (enrichedBatch.length > 0) {
      await saveOffers(enrichedBatch);
    }

    return res.status(200).json({
      ok: true,
      processed: toProcess.length,
      updated,
      removed,
      errors
    });

  } catch (error) {
    console.error("REPROCESS_FAILURE", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
