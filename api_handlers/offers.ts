import { getAdminDb } from "./_lib/firebase-admin";
import { normalizeOfferCategory, collectAutomated, saveOffers } from "./_lib/ml-utils";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  
  const action = req.query.action || (req.method === 'GET' ? 'list' : null);
  console.log("API_OFFERS_ACTION_START", { action, method: req.method });

  try {
    if (action === 'list') {
      const { category, marketplace = "mercadolivre", limit = 50, uid } = req.query;
      const db = getAdminDb();
      let query = db.collection("offer_bank").where("marketplace", "==", marketplace);
      
      if (category && category.toLowerCase() !== "todos") {
          query = query.where("category", "==", category);
      }

      const snapshot = await query.limit(Number(limit)).get();
      let offers = [];
      
      // Parallel loading of affiliate status if uid provided
      const affiliateChecks = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.title && data.price > 0 && data.productUrl) {
          const offer = { id: doc.id, ...data };
          offers.push(offer);
          
          if (uid) {
            const check = db.doc(`offers/${doc.id}/affiliateLinks/${uid}`).get().then(snap => {
              if (snap.exists) {
                offer.userAffiliateUrl = snap.data().affiliateUrl;
                offer.hasUserAffiliateLink = true;
              }
            }).catch(() => {});
            affiliateChecks.push(check);
          }
        }
      });

      if (affiliateChecks.length > 0) {
        await Promise.all(affiliateChecks);
      }

      return res.status(200).json({ ok: true, count: offers.length, offers });
    }

    if (action === 'collect' || action === 'sync') {
      const { marketplace = "mercadolivre", term = "ofertas", category = "Geral" } = req.query;
      const offers = await collectAutomated(term, category);
      const saved = await saveOffers(offers);
      return res.status(200).json({ ok: true, totalSaved: saved, offersCount: offers.length });
    }

    if (action === 'reprocess' || action === 'refresh') {
      const db = getAdminDb();
      const snapshot = await db.collection("offer_bank").limit(20).get();
      // Logic for reprocess could be added here
      return res.status(200).json({ ok: true, message: "Recurso em desenvolvimento", count: snapshot.size });
    }

    if (action === 'health') {
        return res.status(200).json({
          ok: true,
          route: "/api/offers",
          actions: ["list", "collect", "refresh", "reprocess", "health"]
        });
    }

    return res.status(400).json({ ok: false, error: "Ação inválida ou não fornecida." });

  } catch (error) {
    console.error("API_OFFERS_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message || "Erro interno no servidor" });
  }
}
