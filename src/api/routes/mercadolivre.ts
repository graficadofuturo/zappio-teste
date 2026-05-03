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
  console.log("ML_AUTH_URL_START");
  
  const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
  const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI;
  const APP_BASE_URL = process.env.APP_BASE_URL || process.env.APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;

  console.log("ML_AUTH_URL_ENV_CHECK", {
    hasClientId: !!ML_CLIENT_ID,
    hasRedirectUri: !!ML_REDIRECT_URI,
    appBaseUrl: APP_BASE_URL
  });

  try {
    const missing = [];
    if (!ML_CLIENT_ID) missing.push("ML_CLIENT_ID");
    if (!ML_REDIRECT_URI) missing.push("ML_REDIRECT_URI");

    if (missing.length > 0) {
      console.error("ML_AUTH_URL_ERROR", "Missing environment variables", missing);
      return res.status(500).json({
        ok: false,
        error: "missing_env",
        missing
      });
    }

    const state = crypto.randomUUID();

    const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", ML_CLIENT_ID!);
    authorizationUrl.searchParams.set("redirect_uri", ML_REDIRECT_URI!);
    authorizationUrl.searchParams.set("state", state);

    // Keep the state/userId in cookie for the callback to recover it
    const { userId } = req.query;
    res.cookie('ml_oauth_state', JSON.stringify({ state, userId: userId ? String(userId) : "unknown" }), { 
      httpOnly: true, 
      maxAge: 1000 * 60 * 10, 
      sameSite: 'lax', 
      secure: true 
    });

    console.log("ML_AUTH_URL_CREATED", { state });

    return res.status(200).json({
      ok: true,
      authorizationUrl: authorizationUrl.toString(),
      redirectUri: ML_REDIRECT_URI,
      state: state
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
  const APP_BASE_URL = process.env.APP_BASE_URL || process.env.APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
  
  try {
    const url = new URL(req.originalUrl || req.url, APP_BASE_URL);
    const code = url.searchParams.get("code") || req.query.code;
    const state = url.searchParams.get("state") || req.query.state;

    console.log("ML_CALLBACK_START");
    console.log("ML_CALLBACK_PARAMS", { hasCode: !!code, hasState: !!state });

    if (!code) {
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=missing_code`);
    }

    if (!state) {
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=missing_state`);
    }

    const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
    const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
    const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI;
    const FIREBASE_SERVICE_ACCOUNT_KEY = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID;

    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
      console.error("ML_CALLBACK_ERROR", "Missing ML_CLIENT_ID, ML_CLIENT_SECRET or ML_REDIRECT_URI");
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=callback_exception`);
    }

    console.log("ML_TOKEN_REQUEST_START");
    
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code: String(code),
      redirect_uri: ML_REDIRECT_URI,
    });

    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: tokenParams.toString()
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("ML_CALLBACK_ERROR", "Token Error:", errBody);
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=token_error`);
    }

    const tokenData: any = await tokenRes.json();
    console.log("ML_TOKEN_RESPONSE", { hasAccessToken: !!tokenData.access_token });

    console.log("ML_USERS_ME_REQUEST_START");
    const userRes = await fetch("https://api.mercadolibre.com/users/me", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${tokenData.access_token}`
      }
    });

    if (!userRes.ok) {
      const errBody = await userRes.text();
      console.error("ML_CALLBACK_ERROR", "Users Me Error:", errBody);
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=user_error`);
    }

    const mlUser: any = await userRes.json();
    console.log("ML_USERS_ME_RESPONSE", { mlUserId: mlUser.id, nickname: mlUser.nickname });

    if (!FIREBASE_SERVICE_ACCOUNT_KEY || !FIRESTORE_DATABASE_ID) {
      console.error("ML_CALLBACK_ERROR", "Missing FIREBASE_SERVICE_ACCOUNT_KEY or FIRESTORE_DATABASE_ID");
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error`);
    }

    console.log("ML_FIRESTORE_SAVE_START");
    
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_KEY);
    
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });

    const db = getFirestore(app, FIRESTORE_DATABASE_ID || "(default)");

    const sellerId = String(mlUser.id || tokenData.user_id || "");
    const accountName = mlUser.first_name ? `${mlUser.first_name} ${mlUser.last_name || ''}`.trim() : mlUser.nickname;

    const data = {
      user_id: "unknown",
      platform: "mercadolivre",
      seller_id: sellerId,
      ml_user_id: String(mlUser.id),
      account_name: accountName,
      nickname: mlUser.nickname,
      email: mlUser.email,
      site_id: mlUser.site_id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : undefined,
      status: "connected",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    await db.collection("ecommerce_keys").doc(sellerId).set(cleanData, { merge: true });

    console.log("ML_FIRESTORE_SAVE_SUCCESS", { sellerId });
    console.log("ML_CALLBACK_REDIRECT_CONNECTED");
    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=connected`);
  } catch (error: any) {
    console.error("ML_CALLBACK_ERROR", error);
    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=callback_exception`);
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
