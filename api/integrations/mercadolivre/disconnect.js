import { getAdminDb } from "../../../lib/firebaseAdmin.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        connected: false,
        status: "method_not_allowed",
        error: "Método não permitido."
      });
    }

    const db = getAdminDb();
    const ref = db.collection("integrations").doc("mercadolivre");
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(200).json({
        ok: true,
        connected: false,
        status: "not_connected",
        message: "Integração Mercado Livre já não estava conectada."
      });
    }

    await ref.set(
      {
        connected: false,
        status: "disconnected",
        access_token: null,
        refresh_token: null,
        token_type: null,
        expires_in: null,
        scope: null,
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { merge: true }
    );

    return res.status(200).json({
      ok: true,
      connected: false,
      status: "disconnected",
      message: "Mercado Livre desconectado com sucesso."
    });
  } catch (error) {
    console.error("ML_DISCONNECT_ERROR", {
      message: error?.message,
      stack: error?.stack
    });

    return res.status(200).json({
      ok: false,
      connected: true,
      status: "disconnect_error",
      error: error?.message || "Erro ao desconectar Mercado Livre."
    });
  }
}
