import { getAdminDb } from "../../_lib/firebase-admin.js";

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

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { category = "tecnologia", limit = 10 } = req.query;

  try {
    const terms = CATEGORY_MAP[category] || CATEGORY_MAP["todos"];
    const queryTerm = terms[0] || "smartphones"; // pick first for simplicity or random

    const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(queryTerm)}&limit=${limit}`);
    
    if (!mlRes.ok) {
        const errText = await mlRes.text();
        throw new Error(`Mercado Livre API error: ${mlRes.status} - ${errText}`);
    }

    const body = await mlRes.json();
    const results = body.results || [];
    
    const db = getAdminDb();
    let savedCount = 0;
    let sample = null;
    
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
          fetchedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const cleanOffer = Object.fromEntries(
          Object.entries(offer).filter(([_, v]) => v !== undefined)
        );

        await db.collection("offer_bank")
          .doc(`mercadolivre_${offer.marketplaceProductId}`)
          .set(cleanOffer, { merge: true });
          
        savedCount++;
        if (!sample) sample = cleanOffer;
    }

    return res.status(200).json({
      ok: true,
      category: category,
      query: queryTerm,
      fetchedCount: results.length,
      savedCount: savedCount,
      sample: sample
    });

  } catch (error) {
    console.error("ML_FETCH_ERR", error);
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}
