import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin.ts";

const router = Router();

const CATEGORY_MAP = {
  todos: ["ofertas", "promoção", "desconto"],
  tecnologia: ["smartphone", "notebook", "smart tv", "fone bluetooth"],
  casa_moveis: ["sofá", "mesa", "cadeira", "guarda roupa"],
  eletrodomesticos: ["air fryer", "geladeira", "microondas", "cooktop"],
  esporte_fitness: ["creatina", "whey", "bicicleta", "esteira"],
  ferramentas: ["parafusadeira", "furadeira", "kit ferramentas"],
  moda: ["tênis", "camisa", "calça", "jaqueta"],
  beleza: ["perfume", "maquiagem", "skincare", "secador de cabelo"],
  mercado: ["café", "azeite", "cerveja", "chocolate"],
  brinquedos: ["lego", "boneca", "carrinho", "jogo de tabuleiro"],
  automotivo: ["pneu", "óleo automotivo", "som automotivo", "capacete"]
};

router.get("/list", async (req, res) => {
  const { category, limit = 50 } = req.query;

  try {
    const db = await getAdminDb();
    let query = db.collection("offer_bank").where("marketplace", "==", "mercadolivre") as any;
    
    if (category && category !== "todos") {
        query = query.where("category", "==", category);
    }

    // Since we don't have indexes explicitly configured for compound queries right now in this prompt instruction,
    // we'll fetch and sort in memory if needed or just use limit. Let's just use limit and sort in-memory for simple usage.
    const snapshot = await query.limit(Number(limit) * 2).get(); // fetch some extra for sorting
    
    let offers: any[] = [];
    snapshot.forEach((doc: any) => {
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

    return res.status(200).json({
      ok: true,
      count: offers.length,
      offers: offers.slice(0, Number(limit))
    });

  } catch (error: any) {
    console.error("ML_LIST_ERR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/sync", async (req, res) => {
    try {
      const db = await getAdminDb();
      let totalFetched = 0;
      let totalSaved = 0;
      const categoriesResult: Record<string, number> = {};
      const now = new Date().toISOString();
  
      for (const [category, terms] of Object.entries(CATEGORY_MAP)) {
        let catFetched = 0;
        let catSaved = 0;
        
        for (const t of terms) {
          const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(t)}&limit=15`);
          if (!mlRes.ok) continue;
          
          const mlData = await mlRes.json();
          const results = mlData.results || [];
          catFetched += results.length;
          
          if (results.length === 0) continue;
          
          let batch = db.batch();
          let ops = 0;
  
          for (const item of results) {
            if (!item.id || !item.title || !item.price) continue;
            
            const originalPrice = item.original_price || null;
            const price = item.price;
            let discountPercent = null;
            if (originalPrice && price && originalPrice > price) {
              discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
            }
  
            const docId = `mercadolivre_${item.id}`;
            const docRef = db.doc(`offer_bank/${docId}`);
  
            const payload = {
              marketplace: "mercadolivre",
              marketplaceProductId: item.id,
              title: item.title,
              price: price,
              originalPrice: originalPrice,
              currencyId: item.currency_id || "BRL",
              thumbnail: item.thumbnail || null,
              image: item.thumbnail ? item.thumbnail.replace("-I.jpg", "-O.jpg") : null,
              productUrl: item.permalink || null,
              affiliateUrl: null,
              category: category,
              sellerId: item.seller?.id || null,
              sellerNickname: item.seller?.nickname || null,
              condition: item.condition || null,
              availableQuantity: typeof item.available_quantity !== 'undefined' ? item.available_quantity : null,
              soldQuantity: typeof item.sold_quantity !== 'undefined' ? item.sold_quantity : null,
              discountPercent: discountPercent,
              source: "mercadolivre_search",
              fetchedAt: now,
              updatedAt: now
            };
  
            const cleanPayload = Object.fromEntries(
              Object.entries(payload).filter(([_, v]) => v !== undefined)
            );
  
            batch.set(docRef, cleanPayload, { merge: true });
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
        }
        
        categoriesResult[category] = catSaved;
        totalFetched += catFetched;
        totalSaved += catSaved;
      }
  
      return res.status(200).json({
        ok: true,
        totalFetched,
        totalSaved,
        categories: categoriesResult
      });
  
    } catch (error: any) {
      console.error("ML_SYNC_ERR", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
});

export default router;
