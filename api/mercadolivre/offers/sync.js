import { searchByAPI, searchByHTML, saveOffers } from "../../_lib/ml-utils.js";

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
    let totalSaved = 0;
    const categoriesResult = {};
    let apiSearchBlocked = false;
    let fallbackUsed = null;
    let errors = [];

    for (const [category, queryTerm] of Object.entries(CATEGORIES_TO_SYNC)) {
      let offers = [];
      
      try {
        offers = await searchByAPI(queryTerm, 15, category);
      } catch (e) {
        console.error(`API Search failed for ${category}:`, e);
        apiSearchBlocked = true;
        errors.push({ category, source: "api_search", status: e.status, message: e.body || e.message });
        
        try {
          offers = await searchByHTML(queryTerm, category);
          fallbackUsed = "html_search";
        } catch (htmlError) {
          console.error(`HTML Search failed for ${category}:`, htmlError);
          errors.push({ category, source: "html_search", message: htmlError.message });
        }
      }

      if (offers.length > 0) {
        const savedCount = await saveOffers(offers);
        categoriesResult[category] = savedCount;
        totalSaved += savedCount;
      }
    }

    return res.status(200).json({
      ok: true,
      totalSaved,
      categories: categoriesResult,
      apiSearchBlocked,
      fallbackUsed,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error("ML_SYNC_ERR", error);
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}
