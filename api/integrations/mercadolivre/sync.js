import { getAdminDb } from "../../../lib/firebaseAdmin.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Método não permitido."
      });
    }

    const db = getAdminDb();
    const ref = db.collection("integrations").doc("mercadolivre");
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(200).json({
        ok: false,
        connected: false,
        status: "not_connected",
        error: "Mercado Livre não está conectado."
      });
    }

    const data = snap.data() || {};
    const accessToken = data.access_token;

    if (!accessToken) {
      return res.status(200).json({
        ok: false,
        connected: false,
        status: "token_missing",
        error: "Token de acesso não encontrado. Reconecte o Mercado Livre."
      });
    }

    // Call Mercado Livre API to get latest user info
    const response = await fetch("https://api.mercadolibre.com/users/me", {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await ref.update({ sync_status: "token_invalid", updated_at: new Date().toISOString() });
        return res.status(200).json({
          ok: false,
          connected: false,
          status: "token_invalid",
          error: "Token inválido ou expirado. Reconecte o Mercado Livre."
        });
      }
      throw new Error(`Erro na API do Mercado Livre: ${response.status}`);
    }

    const mlUser = await response.json();

    const updateData = {
      ml_user_id: mlUser.id,
      ml_nickname: mlUser.nickname,
      ml_email: mlUser.email,
      nickname: mlUser.nickname,
      email: mlUser.email,
      last_sync_at: new Date().toISOString(),
      sync_status: "success",
      updated_at: new Date().toISOString()
    };

    await ref.update(updateData);

    return res.status(200).json({
      ok: true,
      connected: true,
      status: "connected",
      sync_status: "success",
      mlUserId: mlUser.id,
      nickname: mlUser.nickname,
      email: mlUser.email,
      lastSyncAt: updateData.last_sync_at
    });

  } catch (error) {
    console.error("ML_SYNC_ERROR", {
      message: error?.message,
      stack: error?.stack
    });

    return res.status(200).json({
      ok: false,
      connected: true,
      status: "sync_error",
      error: error?.message || "Erro ao sincronizar Mercado Livre."
    });
  }
}
