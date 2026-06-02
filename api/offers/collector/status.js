import { getAdminDb } from "../../_lib/firebase-admin.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const db = getAdminDb();
    
    const snapshotCount = await db.collection("offer_bank").count().get();
    const offersCount = snapshotCount.data().count;

    // Get breakdown by category
    const categoriesSnapshot = await db.collection("offer_bank").select("category", "marketplace").get();
    const byCategory = {};
    const byMarketplace = {};

    categoriesSnapshot.forEach(doc => {
      const data = doc.data();
      const cat = data.category || "unknown";
      const mkt = data.marketplace || "unknown";
      
      byCategory[cat] = (byCategory[cat] || 0) + 1;
      byMarketplace[mkt] = (byMarketplace[mkt] || 0) + 1;
    });

    return res.status(200).json({
      ok: true,
      lastRunAt: new Date().toISOString(), // This is just current status
      offersCount: offersCount,
      byMarketplace,
      byCategory
    });

  } catch (error) {
    console.error("COLLECTOR_STATUS_ERR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
