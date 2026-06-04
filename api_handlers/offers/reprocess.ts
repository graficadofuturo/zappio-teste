import { getAdminDb } from "../_lib/firebase-admin.js";
import { scrapeProductPage, saveOffers } from "../_lib/ml-utils.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const uid = req.query.uid || req.body?.uid || req.body?.userId;

  try {
    const db = getAdminDb();
    console.log("REPROCESS_START: Fetching all Mercado Livre offers from offer_bank");
    
    const snapshot = await db.collection("offer_bank").get();
      
    if (snapshot.empty) {
      return res.status(200).json({ ok: true, processed: 0, updated: 0, removed: 0 });
    }

    const offers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const mp = data.marketplace || '';
      if (mp === 'mercadolivre' || mp === 'mercadolivre_global' || !mp) {
        offers.push({ id: doc.id, ...data });
      }
    });

    if (offers.length === 0) {
      return res.status(200).json({ ok: true, processed: 0, updated: 0, removed: 0 });
    }

    console.log(`REPROCESS_ITEMS: Found ${offers.length} items to reprocess`);

    // Sort by newest first to prioritize active and recently modified/viewed offers on manual reprocess
    offers.sort((a: any, b: any) => {
      const timeA = new Date(a.updatedAt || a.collectedAt || a.fetchedAt || 0).getTime() || 0;
      const timeB = new Date(b.updatedAt || b.collectedAt || b.fetchedAt || 0).getTime() || 0;
      return timeB - timeA;
    });

    let updated = 0;
    let removed = 0;
    const errors = [];
    const enrichedBatch = [];

    const maxToProcess = 100;
    const toProcess = offers.slice(0, maxToProcess);

    // Process in parallel to prevent Vercel serverless function timeouts (10s limit)
    await Promise.all(toProcess.map(async (offer) => {
      const url = offer.productUrl || offer.url || offer.permalink;
      
      if (!url) {
        console.warn(`REPROCESS_SKIPPING: No URL for document ${offer.id}`);
        removed++;
        return;
      }

      try {
        console.log(`REPROCESS_SCRAPING: ${url}`);
        const enriched = await scrapeProductPage(url, offer.category || 'todos', uid);
        
        if (enriched) {
          enriched.id = offer.id;
          enrichedBatch.push(enriched);
          updated++;
        } else {
          console.warn(`REPROCESS_FAILED: Could not enrich ${url}`);
          // Delete mock items to clean the database
          if (
            offer.id.startsWith('MLB_CATALOG') || 
            url.includes('MLB_CATALOG') || 
            url.includes('/p/MLB27338778') || 
            url.includes('/p/MLB19619670') ||
            url.includes('/p/MLB21619670') ||
            url.includes('/p/MLB22452309') ||
            url.includes('/p/MLB24523090') ||
            url.includes('/p/MLB19619672') ||
            url.includes('/p/MLB18890234') ||
            url.includes('/p/MLB19273570')
          ) {
            console.log(`REPROCESS_DELETING_MOCK: Deleting mock item ${offer.id}`);
            await db.collection("offer_bank").doc(offer.id).delete();
            removed++;
          }
        }
      } catch (err: any) {
        console.error(`REPROCESS_ERROR: ${url}`, err.message);
        errors.push({ id: offer.id, url, error: err.message });
      }
    }));

    if (enrichedBatch.length > 0) {
      await saveOffers(enrichedBatch, uid);
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
