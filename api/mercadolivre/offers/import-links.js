import { fetchItemInfo, saveOffers } from "../../_lib/ml-utils.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { links, category = "tecnologia" } = req.body;

  if (!links || !Array.isArray(links) || links.length === 0) {
    return res.status(400).json({ ok: false, error: "Links are required" });
  }

  try {
    const results = [];
    const errors = [];

    for (const link of links) {
      if (!link || typeof link !== 'string' || !link.startsWith('http')) continue;
      
      try {
        const item = await fetchItemInfo(link, category);
        if (item) {
          results.push(item);
        }
      } catch (e) {
        console.error(`Failed to import link ${link}:`, e);
        errors.push({ link, error: e.message });
      }
    }

    if (results.length > 0) {
      const savedCount = await saveOffers(results);
      return res.status(200).json({
        ok: true,
        totalAttempted: links.length,
        savedCount,
        results: results.map(r => ({ id: r.marketplaceProductId, title: r.title })),
        errors: errors.length > 0 ? errors : undefined
      });
    }

    return res.status(500).json({
      ok: false,
      error: "No links could be imported",
      errors
    });

  } catch (error) {
    console.error("ML_IMPORT_ERR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
