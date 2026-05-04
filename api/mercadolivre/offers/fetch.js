import { searchByAPI, searchByHTML, saveOffers } from "../../_lib/ml-utils.js";

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
    const queryTerm = terms[0] || "smartphones";

    let offers = [];
    let apiSearchBlocked = false;
    let fallbackUsed = null;
    let errors = [];

    // 1. Try API Search
    try {
      offers = await searchByAPI(queryTerm, limit, category);
    } catch (e) {
      console.error("API Search failed:", e);
      apiSearchBlocked = true;
      errors.push({ source: "api_search", status: e.status || 500, message: e.body || e.message });
      
      // 2. Fallback to HTML Search
      try {
        offers = await searchByHTML(queryTerm, category);
        fallbackUsed = "html_search";
      } catch (htmlError) {
        console.error("HTML Search failed:", htmlError);
        errors.push({ source: "html_search", message: htmlError.message });
      }
    }

    if (offers.length > 0) {
      const savedCount = await saveOffers(offers);
      return res.status(200).json({
        ok: true,
        category,
        query: queryTerm,
        fetchedCount: offers.length,
        savedCount,
        apiSearchBlocked,
        fallbackUsed,
        errors: errors.length > 0 ? errors : undefined,
        sample: offers[0]
      });
    }

    // If still no offers, return failure if API was blocked and HTML failed
    return res.status(apiSearchBlocked ? 200 : 500).json({
      ok: offers.length > 0,
      totalSaved: 0,
      apiSearchBlocked,
      errors
    });

  } catch (error) {
    console.error("ML_FETCH_ERR", error);
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}
