import { getAdminDb } from "../_lib/firebase-admin.js";
import { normalizeOfferCategory } from "../_lib/ml-utils.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { category, marketplace = "mercadolivre", limit = 50 } = req.query;

  try {
    const db = getAdminDb();
    let query = db.collection("offer_bank").where("marketplace", "==", marketplace);
    
    if (category && category.toLowerCase() !== "todos") {
        query = query.where("category", "==", category);
    }

    const snapshot = await query.limit(Number(limit)).get();
    
    let offers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Strict server-side filter for valid items
      const hasTitle = data.title && data.title !== "Produto Mercado Livre";
      const hasPrice = data.price && Number(data.price) > 0;
      const hasImage = data.imageUrl || data.image;
      const hasLink = data.productUrl;

      if (hasTitle && hasPrice && hasImage && hasLink) {
        // Fix category on the fly if it is "automotivo" but title suggests otherwise
        let finalCategory = data.category || "Geral";
        if (finalCategory.toLowerCase() === "automotivo") {
           const corrected = normalizeOfferCategory(null, data.title, null);
           if (corrected !== "Automotivo") {
              finalCategory = corrected;
           }
        }

        offers.push({
          id: doc.id,
          ...data,
          category: finalCategory
        });
      }
    });

    return res.status(200).json({
      ok: true,
      count: offers.length,
      offers: offers
    });

  } catch (error) {
    console.error("OFFERS_LIST_ERR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
