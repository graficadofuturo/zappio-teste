import { getAdminDb } from "../../_lib/firebase-admin.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const db = getAdminDb();
    
    // 1. Contar documentos em offer_bank
    const snapshotCount = await db.collection("offer_bank").count().get();
    const offersCount = snapshotCount.data().count;
    
    // 2. Buscar 1 sample
    const sampleSnap = await db.collection("offer_bank").limit(1).get();
    let sampleOffer = null;
    if (!sampleSnap.empty) {
        sampleOffer = { id: sampleSnap.docs[0].id, ...sampleSnap.docs[0].data() };
    }
    
    // 3. Testar API Search
    let apiSearch = { ok: false, status: null, bodyPreview: "" };
    try {
        const mlRes = await fetch("https://api.mercadolibre.com/sites/MLB/search?q=smartphone&limit=1");
        apiSearch.status = mlRes.status;
        const bodyText = await mlRes.text();
        apiSearch.bodyPreview = bodyText.slice(0, 100);
        if (mlRes.ok) {
            apiSearch.ok = true;
        }
    } catch (apiError) {
        apiSearch.error = apiError.message;
    }

    // 4. Testar HTML Search
    let htmlSearch = { ok: false, status: null, htmlLength: 0, productsExtracted: 0 };
    try {
        const res = await fetch("https://lista.mercadolivre.com.br/smartphone");
        htmlSearch.status = res.status;
        if (res.ok) {
            htmlSearch.ok = true;
            const html = await res.text();
            htmlSearch.htmlLength = html.length;
            // Simple check
            htmlSearch.productsExtracted = (html.match(/ui-search-result__wrapper/g) || []).length;
        }
    } catch (e) {
        htmlSearch.error = e.message;
    }

    return res.status(200).json({
      ok: true,
      collection: "offer_bank",
      offersCount: offersCount,
      sampleOffer: sampleOffer,
      apiSearch,
      htmlSearch,
      firestore: {
          ok: true,
          offersCount: offersCount
      }
    });

  } catch (error) {
    console.error("ML_DEBUG_ERR", error);
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}
