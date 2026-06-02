import { getAdminDb } from "../../_lib/firebase-admin.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const db = getAdminDb();
    const docPath = "marketplace_integrations/mercadolivre";
    const docRef = db.doc(docPath);
    
    console.log("ML_DISCONNECT_PATH", docPath);
    
    await docRef.delete();

    return res.status(200).json({
      ok: true,
      disconnected: true
    });
  } catch (error) {
    console.error("ML_DISCONNECT_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: error?.message || "Unknown error"
    });
  }
}
