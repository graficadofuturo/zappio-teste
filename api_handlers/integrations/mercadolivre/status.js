import { getAdminDb } from "../../_lib/firebase-admin.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  console.log("ML_STATUS_FILE", "api/integrations/mercadolivre/status.js");

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      connected: false,
      error: "Method not allowed"
    });
  }

  try {
    const db = getAdminDb();
    const docPath = "marketplace_integrations/mercadolivre";
    const docRef = db.doc(docPath);
    
    console.log("ML_STATUS_READ_PATH", docPath);
    const doc = await docRef.get();
    
    console.log("ML_STATUS_DOC_EXISTS", doc.exists);
    console.log("ML_STATUS_DOC_DATA_PREVIEW", doc.exists ? {
      connected: doc.data().connected,
      mlUserId: doc.data().mlUserId,
      nickname: doc.data().nickname,
      email: doc.data().email
    } : null);

    if (doc.exists && doc.data()?.connected === true) {
      const data = doc.data();
      return res.status(200).json({
        ok: true,
        connected: true,
        marketplace: "mercadolivre",
        mlUserId: data.mlUserId || null,
        nickname: data.nickname || null,
        email: data.email || null,
        connectedAt: data.connectedAt || null,
        updatedAt: data.updatedAt || null
      });
    }

    return res.status(200).json({
      ok: true,
      connected: false,
      marketplace: "mercadolivre"
    });

  } catch (error) {
    console.error("ML_STATUS_ERROR", error);
    return res.status(500).json({
      ok: false,
      connected: false,
      error: error?.message || "Unknown error"
    });
  }
}
