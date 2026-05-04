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
    
    // 3. Testar API Mercado Livre
    let mercadoLivreApiTest = { ok: false, status: null, resultsCount: 0 };
    try {
        const mlRes = await fetch("https://api.mercadolibre.com/sites/MLB/search?q=smartphone&limit=1");
        mercadoLivreApiTest.status = mlRes.status;
        if (mlRes.ok) {
            mercadoLivreApiTest.ok = true;
            const data = await mlRes.json();
            mercadoLivreApiTest.resultsCount = data.results ? data.results.length : 0;
        }
    } catch (apiError) {
        mercadoLivreApiTest.error = apiError.message;
    }

    return res.status(200).json({
      ok: true,
      collection: "offer_bank",
      offersCount: offersCount,
      sampleOffer: sampleOffer,
      mercadoLivreApiTest: mercadoLivreApiTest
    });

  } catch (error) {
    console.error("ML_DEBUG_ERR", error);
    return res.status(500).json({ ok: false, error: error.message, stack: error.stack });
  }
}
