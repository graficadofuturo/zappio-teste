import { collectAutomated, saveOffers } from "../_lib/ml-utils.js";

const CATEGORY_KEYWORDS = [
  { category: "tecnologia", term: "smartphone" },
  { category: "casa_moveis", term: "cadeira gamer" },
  { category: "eletrodomesticos", term: "air fryer" },
  { category: "esporte_fitness", term: "creatina" },
  { category: "moda", term: "tenis nike" }
];

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // Auth check for cron
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error("ML_OFFERS_COLLECT_ERROR: Unauthorized CRON attempt");
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  console.log("ML_OFFERS_COLLECT_START: Cron triggered");

  try {
    let totalSaved = 0;
    
    // Process a few categories in each cron run to avoid timeouts
    for (const item of CATEGORY_KEYWORDS) {
      try {
        const validOffers = await collectAutomated(item.term, item.category);
        if (validOffers.length > 0) {
          const saved = await saveOffers(validOffers);
          totalSaved += saved;
        }
      } catch (err) {
        console.error(`ML_OFFERS_COLLECT_ERROR: Cron failed for ${item.category}`, err.message);
      }
    }

    console.log(`ML_OFFERS_COLLECT_FINISH: Cron completed. Total saved: ${totalSaved}`);

    return res.status(200).json({
      ok: true,
      totalSaved,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("ML_OFFERS_COLLECT_ERROR: Cron critical failure", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
