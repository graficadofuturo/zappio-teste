import { searchByAPI, searchByHTML, saveOffers, CATEGORY_TERMS } from "../../_lib/ml-utils.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const { marketplace = "mercadolivre", category, limit = 50 } = req.query;

  try {
    let totalSaved = 0;
    const sourcesUsed = [];
    let apiSearchBlocked = false;
    const errors = [];
    const categoriesToProcess = category && category !== "todos" 
      ? { [category]: CATEGORY_TERMS[category] } 
      : CATEGORY_TERMS;

    for (const [catName, terms] of Object.entries(categoriesToProcess)) {
      // Pick first term for each category to keep it efficient in a single run
      const queryTerm = terms[0];
      let offers = [];

      // Layer 1: API Search
      try {
        offers = await searchByAPI(queryTerm, 15, catName);
        if (!sourcesUsed.includes("api_search")) sourcesUsed.push("api_search");
      } catch (e) {
        console.error(`API Search failed for ${catName}:`, e);
        apiSearchBlocked = true;
        errors.push({ category: catName, source: "api_search", status: e.status, message: e.body || e.message });
        
        // Layer 2: HTML Search (Public Pages)
        try {
          offers = await searchByHTML(queryTerm, catName);
          if (!sourcesUsed.includes("html_public_pages")) sourcesUsed.push("html_public_pages");
        } catch (htmlError) {
          console.error(`HTML Search failed for ${catName}:`, htmlError);
          errors.push({ category: catName, source: "html_public_pages", message: htmlError.message });
        }
      }

      if (offers.length > 0) {
        const saved = await saveOffers(offers);
        totalSaved += saved;
      }
    }

    return res.status(200).json({
      ok: true,
      marketplace,
      totalCollected: totalSaved, // approximation
      totalSaved,
      sourcesUsed,
      apiSearchBlocked,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error("COLLECTOR_RUN_ERR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
