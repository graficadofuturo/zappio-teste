import { Router } from "express";
import { getAdminFirestore, removeUndefinedDeep } from "../firebaseAdmin.ts";
import crypto from "crypto";

const router = Router();

router.get("/debug-config", (req, res) => {
  const appUrl = process.env.APP_BASE_URL || process.env.APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
  res.json({
    ok: true,
    hasClientId: !!(process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID),
    hasClientSecret: !!(process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_CLIENT_SECRET),
    hasMlRedirectUri: !!(process.env.ML_REDIRECT_URI || process.env.MERCADOLIVRE_REDIRECT_URI),
    redirectUri: process.env.ML_REDIRECT_URI || process.env.MERCADOLIVRE_REDIRECT_URI,
    appBaseUrl: appUrl,
    webhookUrl: process.env.ML_WEBHOOK_URL
  });
});

router.get("/status", async (req, res) => {
  try {
    const db = getAdminFirestore();
    const { userId } = req.query;

    let query = db.collection("ecommerce_keys")
      .where("platform", "==", "mercadolivre")
      .where("status", "==", "connected");
      
    if (userId && userId !== 'undefined') {
        query = query.where("user_id", "==", userId);
    }

    const qs = await query.get();

    if (qs.empty) {
      return res.status(200).json({ connected: false });
    }

    const docData = qs.docs[0].data();

    return res.status(200).json({
      connected: true,
      marketplace: "mercadolivre",
      ml_user_id: docData.ml_user_id || docData.seller_id,
      mlUserId: docData.ml_user_id || docData.seller_id,
      nickname: docData.nickname || "N/A",
      email: docData.email || null,
      account_name: docData.account_name || null,
      site_id: docData.site_id || null,
      connected_at: docData.connected_at || docData.connectedAt,
      updated_at: docData.updated_at
    });
  } catch (error: any) {
    console.error("ML_STATUS_ERROR", error.message);
    return res.status(200).json({ connected: false, error: error.message });
  }
});

router.get("/auth-url", async (req, res) => {
  const appUrl = process.env.APP_BASE_URL || process.env.APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
  const ML_CLIENT_ID = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID;
  const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || process.env.MERCADOLIVRE_REDIRECT_URI;

  console.log("ML_AUTH_URL_START", {
     hasMlRedirectUri: !!ML_REDIRECT_URI,
     redirectUri: ML_REDIRECT_URI,
     appBaseUrl: appUrl,
     hasClientId: !!ML_CLIENT_ID,
     hasClientSecret: !!(process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_CLIENT_SECRET)
  });

  try {
    if (!ML_CLIENT_ID || !ML_REDIRECT_URI) {
      const missing = [];
      if (!ML_CLIENT_ID) missing.push("ML_CLIENT_ID");
      if (!ML_REDIRECT_URI) missing.push("ML_REDIRECT_URI");
      
      console.error("ML_AUTH_URL_ERROR", "Missing environment variables", missing);
      return res.status(200).json({
        ok: false,
        error: "missing_ml_redirect_uri",
        message: "A variável ML_REDIRECT_URI ou ML_CLIENT_ID não está configurada no ambiente.",
        missing
      });
    }

    const state = crypto.randomBytes(16).toString("hex");

    const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", ML_CLIENT_ID);
    authorizationUrl.searchParams.set("redirect_uri", ML_REDIRECT_URI);
    authorizationUrl.searchParams.set("state", state);

    const { userId } = req.query;
    res.cookie('ml_oauth_state', JSON.stringify({ state, userId: userId ? String(userId) : "unknown" }), { 
      httpOnly: true, 
      maxAge: 1000 * 60 * 10, 
      sameSite: 'lax', 
      secure: true 
    });

    return res.status(200).json({
      ok: true,
      authorizationUrl: authorizationUrl.toString()
    });
  } catch (error: any) {
    console.error("ML_AUTH_URL_ERROR", error.message);
    return res.status(500).json({
      ok: false,
      error: "auth_url_exception",
      message: error.message || "Erro ao gerar URL de conexão."
    });
  }
});

router.get("/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  
  const appUrl = process.env.APP_BASE_URL || process.env.APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
  const ML_CLIENT_ID = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID;
  const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_CLIENT_SECRET;
  const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || process.env.MERCADOLIVRE_REDIRECT_URI;

  console.log("ML_CALLBACK_START", {
    hasCode: !!code,
    hasState: !!state,
    hasMlRedirectUri: !!ML_REDIRECT_URI,
    redirectUri: ML_REDIRECT_URI,
    appBaseUrl: appUrl,
    hasClientId: !!ML_CLIENT_ID,
    hasClientSecret: !!ML_CLIENT_SECRET
  });

  try {
    if (error) {
       console.error("ML_CALLBACK_ERROR_FROM_PROVIDER", error);
       return res.redirect(`${appUrl}/integrations?mercadolivre=error&reason=${error}`);
    }

    if (!code) {
       console.error("ML_CALLBACK_MISSING_CODE");
       return res.redirect(`${appUrl}/integrations?mercadolivre=error&reason=missing_code`);
    }

    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
        console.error("ML_CALLBACK_CONFIG_ERROR", {
            hasClientId: !!ML_CLIENT_ID,
            hasClientSecret: !!ML_CLIENT_SECRET,
            hasRedirectUri: !!ML_REDIRECT_URI
        });
        return res.redirect(`${appUrl}/integrations?mercadolivre=error&reason=config_error`);
    }

    console.log("ML_TOKEN_EXCHANGE_START");
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded', 
          'Accept': 'application/json' 
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: ML_CLIENT_ID,
            client_secret: ML_CLIENT_SECRET,
            code: String(code),
            redirect_uri: ML_REDIRECT_URI
        }).toString()
    });

    if (!tokenRes.ok) {
        const errorData = await tokenRes.json().catch(() => ({}));
        console.error("ML_TOKEN_ERROR_RESPONSE", errorData);
        return res.redirect(`${appUrl}/integrations?mercadolivre=error&reason=token_error`);
    }

    const tokenData: any = await tokenRes.json();
    console.log("ML_TOKEN_RESPONSE_RECEIVED");

    const userRes = await fetch('https://api.mercadolibre.com/users/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!userRes.ok) {
        console.error("ML_USERS_ME_ERROR_RESPONSE");
        return res.redirect(`${appUrl}/integrations?mercadolivre=error&reason=users_me_error`);
    }

    const mlUser: any = await userRes.json();
    console.log("ML_USERS_ME_RESPONSE_RECEIVED", { nickname: mlUser.nickname });

    const db = getAdminFirestore();

    // Recover userId from state or cookie if available
    let userId = 'unknown';
    const stateCookie = req.cookies?.ml_oauth_state;
    if (stateCookie) {
        try {
            const cookieData = JSON.parse(stateCookie);
            userId = cookieData.userId;
        } catch (e) {}
    }

    const sellerId = (mlUser.id || tokenData.user_id || '').toString();
    const accountName = mlUser.first_name ? `${mlUser.first_name} ${mlUser.last_name || ''}`.trim() : mlUser.nickname;
    
    const integrationData = removeUndefinedDeep({
      user_id: userId,
      platform: "mercadolivre",
      seller_id: sellerId,
      ml_user_id: mlUser.id?.toString(),
      account_name: accountName,
      nickname: mlUser.nickname,
      email: mlUser.email,
      site_id: mlUser.site_id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
      status: "connected",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await db.collection("ecommerce_keys").doc(sellerId).set(integrationData, { merge: true });
    
    console.log("ML_FIRESTORE_SAVE_SUCCESS", { sellerId });
    res.clearCookie('ml_oauth_state');
    return res.redirect(`${appUrl}/integrations?mercadolivre=connected`);
  } catch (error: any) {
    console.error("ML_CALLBACK_EXCEPTION", error.message);
    return res.redirect(`${appUrl}/integrations?mercadolivre=error&reason=callback_exception`);
  }
});

router.post("/disconnect", async (req, res) => {
  try {
    const db = getAdminFirestore();
    const { userId } = req.query;

    let query = db.collection("ecommerce_keys")
      .where("platform", "==", "mercadolivre")
      .where("status", "==", "connected");
      
    if (userId && userId !== 'undefined') {
        query = query.where("user_id", "==", userId);
    }

    const qs = await query.get();

    if (qs.empty) {
      return res.status(200).json({ ok: true, connected: false });
    }

    const batch = db.batch();
    qs.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: "disconnected",
        access_token: null,
        refresh_token: null,
        updated_at: new Date().toISOString()
      });
    });

    await batch.commit();

    return res.status(200).json({
      ok: true,
      connected: false
    });
  } catch (error: any) {
    console.error("ML_DISCONNECT_ERROR", error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/sync", async (req, res) => {
  try {
    const { integrationId } = req.body;
    const { syncMLProducts } = await import("../../lib/mercadolivre/mlService.ts");
    const count = await syncMLProducts(integrationId);
    res.json({ success: true, count });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to sync ML products" });
  }
});

export default router;
