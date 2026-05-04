import { getAdminDb } from "../../_lib/firebase-admin.js";

const CATEGORIES_TO_SYNC = {
  "tecnologia": "smartphone",
  "eletrodomesticos": "air fryer",
  "ferramentas": "furadeira",
  "casa_moveis": "mesa"
};

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const db = getAdminDb();
    let totalSaved = 0;
    const categoriesResult = {};
    const now = new Date().toISOString();

    for (const [category, queryTerm] of Object.entries(CATEGORIES_TO_SYNC)) {
      let catSaved = 0;
      
      const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(queryTerm)}&limit=15`);
      if (!mlRes.ok) {
          const text = await mlRes.text();
          throw new Error(`ML API Error (${mlRes.status}): ${text}`);
      }
      
      const mlData = await mlRes.json();
      const results = mlData.results || [];
      
      if (results.length === 0) continue;
      
      let batch = db.batch();
      let ops = 0;

      for (const item of results) {
        if (!item.id || !item.title || !item.price) continue;
        
        const originalPrice = item.original_price ?? null;
        const price = item.price ?? null;
        let discountPercent = null;
        if (originalPrice && price && originalPrice > price) {
          discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
        }

        const offer = {
          marketplace: "mercadolivre",
          marketplaceProductId: item.id,
          title: item.title || null,
          price: price,
          originalPrice: originalPrice,
          currencyId: item.currency_id || "BRL",
          thumbnail: item.thumbnail || null,
          image: item.thumbnail ? item.thumbnail.replace("-I.jpg", "-O.jpg") : null,
          productUrl: item.permalink || null,
          affiliateUrl: null,
          category: category,
          sellerId: item.seller?.id ? String(item.seller.id) : null,
          sellerNickname: item.seller?.nickname || null,
          condition: item.condition || null,
          availableQuantity: item.available_quantity ?? null,
          soldQuantity: item.sold_quantity ?? null,
          discountPercent: discountPercent,
          source: "mercadolivre_search",
          fetchedAt: now,
          updatedAt: now
        };

        const cleanOffer = Object.fromEntries(
          Object.entries(offer).filter(([_, v]) => v !== undefined)
        );

        const docRef = db.doc(`offer_bank/mercadolivre_${offer.marketplaceProductId}`);
        batch.set(docRef, cleanOffer, { merge: true });
        
        catSaved++;
        ops++;
        
        if (ops === 400) {
            await batch.commit();
            batch = db.batch();
            ops = 0;
        }
      }
      
      if (ops > 0) {
          await batch.commit();
      }
      
      categoriesResult[category] = catSaved;
      totalSaved += catSaved;
    }

    return res.status(200).json({
      ok: true,
      totalSaved,
      categories: categoriesResult
    });

  } catch (error) {
    console.error("ML_SYNC_ERR", error);
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}
