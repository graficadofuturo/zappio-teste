import { getAdminDb } from "../../_lib/firebase-admin.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { category, limit = 50 } = req.query;

  try {
    const db = getAdminDb();
    console.log("ML_OFFERS_LIST_COLLECTION", "offer_bank");
    console.log("ML_OFFERS_LIST_CATEGORY", category);
    
    let query = db.collection("offer_bank").where("marketplace", "==", "mercadolivre");
    
    if (category && category !== "todos") {
        query = query.where("category", "==", category);
    }

    const snapshot = await query.limit(Number(limit)).get();
    
    let offers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      offers.push({
        id: doc.id,
        marketplace: data.marketplace,
        marketplaceProductId: data.marketplaceProductId,
        title: data.title,
        price: data.price,
        originalPrice: data.originalPrice,
        discountPercent: data.discountPercent,
        image: data.image,
        productUrl: data.productUrl,
        affiliateUrl: data.affiliateUrl,
        category: data.category,
        fetchedAt: data.fetchedAt,
        updatedAt: data.updatedAt
      });
    });

    console.log("ML_OFFERS_LIST_COUNT", offers.length);

    return res.status(200).json({
      ok: true,
      count: offers.length,
      offers: offers
    });

  } catch (error) {
    console.error("ML_LIST_ERR", error);
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}
