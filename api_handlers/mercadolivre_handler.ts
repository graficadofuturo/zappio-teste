import { getAdminDb } from "./_lib/firebase-admin.js";
import { collectAutomated, saveOffers, getMlAccessToken } from "./_lib/ml-utils.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  
  const action = req.query.action || (req.method === 'GET' ? 'status' : null);
  const uid = req.query.uid || req.body?.uid || req.body?.userId;

  console.log("API_ML_ACTION_START", { action, method: req.method, uid });

  try {
    if (action === 'status') {
      if (!uid) return res.status(400).json({ ok: false, error: "UID_REQUIRED" });

      // Proactively check token status and refresh if expired (handling invalid grant gracefully)
      try {
        await getMlAccessToken(uid);
      } catch (err: any) {
        console.error("[STATUS] Error pre-refreshing token:", err.message);
      }

      const db = getAdminDb();
      let doc = await db.doc(`users/${uid}/integrations/mercadolivre`).get();
      
      if (!doc.exists) {
        doc = await db.collection("mercado_livre_integrations").doc(uid).get();
      }
      
      if (!doc.exists) {
        return res.status(200).json({ ok: true, connected: false });
      }
      
      const data = doc.data();
      return res.status(200).json({
        ok: true,
        connected: data.connected || data.enabled || false,
        status: data.status || 'CONECTADO',
        nickname: data.nickname || data.user_id,
        email: data.email,
        mlUserId: data.mlUserId || data.ml_user_id || data.user_id,
        integration: data
      });
    }

    if (action === 'sync-offers' || action === 'collect-offers') {
      // Trigger a sync for the user
      const terms = ["celular", "televisão", "tênis", "cozinha", "ferramentas"];
      const randomTerm = terms[Math.floor(Math.random() * terms.length)];
      const offers = await collectAutomated(randomTerm);
      const saved = await saveOffers(offers);
      return res.status(200).json({ ok: true, syncCount: saved });
    }

    if (action === 'auth-url') {
      // Logic from integrations/mercadolivre/auth-url.js
      // I'll keep it simple here but we could merge it
      return res.status(501).json({ ok: false, error: "Use /api/integrations/mercadolivre/auth-url por enquanto" });
    }

    if (action === 'health') {
      return res.status(200).json({ ok: true, route: "/api/mercadolivre", actions: ["status", "sync-offers", "health"] });
    }

    return res.status(400).json({ ok: false, error: "Ação não suportada" });

  } catch (error) {
    console.error("API_ML_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message || "Erro interno" });
  }
}
