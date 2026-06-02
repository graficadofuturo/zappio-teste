import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin.ts";
import { simplifyProductTitle } from "../../lib/productUtils.ts";

const router = Router();

router.get("/", async (req, res) => {
  const { marketplace, status, category } = req.query;
  try {
    const db = await getAdminDb();
    let query = db.collection("affiliate_offers") as any;

    if (marketplace) {
      if (marketplace === "Mercado Livre") {
         // Handle both variations
         query = query.where("marketplace", "in", ["mercadolivre", "mercado_livre", "Mercado Livre"]);
      } else {
         query = query.where("marketplace", "==", marketplace);
      }
    }

    if (status) {
      query = query.where("status", "==", status);
    }
    
    if (category && category !== 'Todos') {
      query = query.where("category", "==", category);
    }

    const snapshot = await query.orderBy("updated_at", "desc").limit(100).get();
    const offers = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    res.status(200).json({ ok: true, offers });
  } catch (error: any) {
    console.error("OFFERS_GET_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/mercadolivre/sync-daily", async (req, res) => {
  try {
    // For now we simulate/proxy to the actual logic if needed, 
    // or just return success if the background job already does it.
    // In this app, we might want to trigger the real scraping logic.
    const { fetchMLProductsByKeyword } = await import("../campaignService.ts");
    const db = await getAdminDb();
    
    // Simple sync: fetch some trending items
    const keywords = ["ofertas do dia", "promoção", "desconto"];
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    const products = await fetchMLProductsByKeyword(keyword);

    let count = 0;
    for (const prod of products) {
        const offerId = `ml_${prod.id}`;
        const fullTitle = prod.title.trim();
        const shortTitle = simplifyProductTitle(fullTitle);

        await db.collection("affiliate_offers").doc(offerId).set({
            marketplace: "mercadolivre",
            product_name: shortTitle, // Simplified for campaigns
            titleShort: shortTitle,
            titleOriginal: fullTitle,
            product_image: prod.thumbnail.replace("-I.jpg", "-V.jpg"),
            product_price: prod.price,
            product_old_price: prod.original_price || null,
            product_discount: prod.original_price ? `${Math.round((1 - prod.price / prod.original_price) * 100)}% OFF` : null,
            product_original_link: prod.permalink,
            product_affiliate_link: prod.permalink, // Real affiliate link would be generated here if we had the API
            category: "Mercado Livre",
            status: "active",
            updated_at: new Date().toISOString()
        }, { merge: true });
        count++;
    }

    res.status(200).json({ ok: true, message: `Sincronização concluída: ${count} ofertas atualizadas.` });
  } catch (error: any) {
    console.error("OFFERS_SYNC_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const db = await getAdminDb();
    const querySnapshot = await db.collection("affiliate_offers").get();
    const categories = new Set<string>();
    categories.add("Todos");
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.category) {
        categories.add(data.category);
      }
    });

    res.status(200).json({ ok: true, categories: Array.from(categories) });
  } catch (error: any) {
    console.error("OFFERS_CATEGORIES_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
