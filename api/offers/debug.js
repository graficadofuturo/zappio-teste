import { getAdminDb } from "../_lib/firebase-admin.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const db = getAdminDb();
    
    // 1. Contar documentos
    const snapshotCount = await db.collection("offer_bank").count().get();
    const offersCount = snapshotCount.data().count;
    
    // 2. Testar API Search
    let apiSearch = { ok: false, status: null, bodyPreview: "" };
    try {
        const mlRes = await fetch("https://api.mercadolibre.com/sites/MLB/search?q=smartphone&limit=1");
        apiSearch.status = mlRes.status;
        const bodyText = await mlRes.text();
        apiSearch.bodyPreview = bodyText.slice(0, 100);
        if (mlRes.ok) apiSearch.ok = true;
    } catch (apiError) {
        apiSearch.error = apiError.message;
    }

    // 3. Testar HTML Search
    let htmlSearch = { ok: false, status: null, htmlLength: 0, productsExtracted: 0 };
    try {
        const res = await fetch("https://lista.mercadolivre.com.br/smartphone");
        htmlSearch.status = res.status;
        if (res.ok) {
            htmlSearch.ok = true;
            const html = await res.text();
            htmlSearch.htmlLength = html.length;
            htmlSearch.productsExtracted = (html.match(/ui-search-result__wrapper/g) || []).length;
        }
    } catch (e) {
        htmlSearch.error = e.message;
    }

    return res.status(200).json({
      ok: true,
      apiSearch,
      htmlSearch,
      firestore: {
          ok: true,
          offersCount: offersCount
      }
    });

  } catch (error) {
    console.error("OFFERS_DEBUG_ERR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
