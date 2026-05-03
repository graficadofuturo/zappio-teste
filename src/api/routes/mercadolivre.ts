import { Router } from "express";
import { getAdminFirestore, removeUndefinedDeep } from "../firebaseAdmin.ts";
import crypto from "crypto";

const router = Router();

router.get("/debug-config", (req, res) => {
  const appUrl = process.env.APP_BASE_URL || process.env.APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
  res.json({
    ok: true,
    hasClientId: !!process.env.ML_CLIENT_ID,
    hasClientSecret: !!process.env.ML_CLIENT_SECRET,
    hasMlRedirectUri: !!process.env.ML_REDIRECT_URI,
    redirectUri: process.env.ML_REDIRECT_URI,
    appBaseUrl: appUrl,
    webhookUrl: process.env.ML_WEBHOOK_URL
  });
});

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    route: "mercadolivre-ping"
  });
});

router.get("/status", async (req, res) => {
  try {
    const db = getAdminFirestore();
    const { userId } = req.query;

    console.log("ML_STATUS_START", { userId });

    if (!userId || userId === 'undefined') {
        console.log("ML_STATUS_NOT_FOUND", "No user ID provided");
        return res.status(200).json({ 
          ok: true,
          connected: false,
          integration: null 
        });
    }

    console.log("ML_STATUS_FIRESTORE_PATH", `users/${userId}/integrations/mercadolivre`);
    
    // First try the new path
    const docRef = db.collection("users").doc(String(userId)).collection("integrations").doc("mercadolivre");
    const docSnap = await docRef.get();

    let docData: any = null;

    if (docSnap.exists) {
      docData = docSnap.data();
    } else {
      // Fallback to legacy path
      console.log("ML_STATUS_FIRESTORE_PATH", `ecommerce_keys (fallback)`);
      const query = db.collection("ecommerce_keys")
        .where("platform", "==", "mercadolivre")
        .where("status", "==", "connected")
        .where("user_id", "==", String(userId));
      const qs = await query.get();
      if (!qs.empty) {
        docData = qs.docs[0].data();
      }
    }

    if (!docData || docData.connected !== true && docData.status !== "connected") {
      console.log("ML_STATUS_NOT_FOUND", "Docs exists but not connected");
      return res.status(200).json({ 
        ok: true,
        connected: false,
        integration: null 
      });
    }

    console.log("ML_STATUS_RESPONSE", { mlUserId: docData.ml_user_id || docData.seller_id });

    return res.status(200).json({
      ok: true,
      connected: true,
      integration: {
        marketplace: "mercadolivre",
        mlUserId: docData.mlUserId || docData.ml_user_id || docData.seller_id,
        nickname: docData.nickname || null,
        email: docData.email || null,
        connectedAt: docData.connectedAt || docData.connected_at || null,
        updatedAt: docData.updatedAt || docData.updated_at || null
      }
    });
  } catch (error: any) {
    console.error("ML_ERROR", "ML_STATUS_ERROR", error.message);
    return res.status(200).json({ 
      ok: true, 
      connected: false,
      integration: null,
      error: error.message 
    });
  }
});

router.get("/auth-url", async (req, res) => {
  console.log("ML_AUTH_URL_START");
  
  const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
  const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI;
  const APP_BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;

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
        error: "Missing Mercado Livre OAuth environment variables",
        missing
      });
    }

    const { userId } = req.query;
    
    // We encode the state to contain random data + userId
    const statePayload = {
        uuid: crypto.randomUUID(),
        userId: userId ? String(userId) : "unknown"
    };
    const state = encodeURIComponent(JSON.stringify(statePayload));

    const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", ML_CLIENT_ID!);
    authorizationUrl.searchParams.set("redirect_uri", ML_REDIRECT_URI!);
    authorizationUrl.searchParams.set("state", state);

    // Also use cookie as a fallback explicitly if state parsing somehow fails
    res.cookie('ml_oauth_state', JSON.stringify(statePayload), { 
      httpOnly: true, 
      maxAge: 1000 * 60 * 10, 
      sameSite: 'lax', 
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https' 
    });

    console.log("ML_AUTH_URL_SUCCESS", { state: statePayload.uuid });

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
  const APP_BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
  
  try {
    const requestUrl = new URL(req.url, `https://${req.headers.host}`);
    const code = requestUrl.searchParams.get("code") || req.query.code;
    const state = requestUrl.searchParams.get("state") || req.query.state;

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
      console.error("ML_ERROR", "Missing ML_CLIENT_ID, ML_CLIENT_SECRET or ML_REDIRECT_URI");
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
      console.error("ML_ERROR", "Token Error:", errBody);
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
      console.error("ML_ERROR", "Users Me Error:", errBody);
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=user_error`);
    }

    const mlUser: any = await userRes.json();
    console.log("ML_USERS_ME_RESPONSE", { mlUserId: mlUser.id, nickname: mlUser.nickname });

    if (!FIREBASE_SERVICE_ACCOUNT_KEY || !FIRESTORE_DATABASE_ID) {
      console.error("ML_ERROR", "Missing FIREBASE_SERVICE_ACCOUNT_KEY or FIRESTORE_DATABASE_ID");
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error`);
    }

    console.log("ML_FIRESTORE_SAVE_START");
    
    // Recover userId from state or cookie if available
    let userId = "unknown";
    if (state) {
      try {
        const decodedState = JSON.parse(decodeURIComponent(String(state)));
        if (decodedState.userId) userId = String(decodedState.userId);
      } catch (e) {}
    }
    
    if (userId === "unknown") {
        const stateCookie = req.cookies?.ml_oauth_state;
        if (stateCookie) {
            try {
                const cookieData = JSON.parse(stateCookie);
                userId = cookieData.userId || "unknown";
            } catch (e) {}
        }
    }

    const { getAdminFirestore } = await import("../firebaseAdmin.ts");
    const db = getAdminFirestore();

    const sellerId = String(mlUser.id || tokenData.user_id || "");
    const accountName = mlUser.first_name ? `${mlUser.first_name} ${mlUser.last_name || ''}`.trim() : mlUser.nickname;

    const data = {
      marketplace: "mercadolivre",
      connected: true,
      status: "connected", // Keeping for compatibility
      mlUserId: String(mlUser.id),
      nickname: mlUser.nickname,
      email: mlUser.email || null,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      expiresIn: tokenData.expires_in || null,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // Legacy fields keeping for compatibility with existing queries
      user_id: userId,
      platform: "mercadolivre",
      seller_id: String(mlUser.id),
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      status_date: new Date().toISOString()
    };

    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined && value !== null)
    );

    try {
      if (userId && userId !== "unknown") {
        console.log("ML_CALLBACK_SAVE_START", { path: `users/${userId}/integrations/mercadolivre` });
        await db.collection("users").doc(userId).collection("integrations").doc("mercadolivre").set(cleanData, { merge: true });
      }
      
      // Keep legacy path temporarily for syncing compatibility
      await db.collection("ecommerce_keys").doc(sellerId).set(cleanData, { merge: true });
      console.log("ML_FIRESTORE_SAVE_SUCCESS", { sellerId });
    } catch (dbErr) {
      console.error("ML_ERROR", "DB Save Error", dbErr);
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error`);
    }

    console.log("ML_CALLBACK_REDIRECT_CONNECTED");
    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=connected`);
  } catch (error: any) {
    console.error("ML_ERROR", error);
    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=callback_exception`);
  }
});

router.post("/disconnect", async (req, res) => {
  try {
    const db = getAdminFirestore();
    const { userId } = req.query;

    if (!userId || userId === 'undefined') {
        return res.status(400).json({ ok: false, error: "Missing user ID" });
    }

    const batch = db.batch();

    // 1. New path
    const docRef = db.collection("users").doc(String(userId)).collection("integrations").doc("mercadolivre");
    batch.set(docRef, {
      status: "disconnected",
      connected: false,
      access_token: null,
      refresh_token: null,
      accessToken: null,
      refreshToken: null,
      disconnectedAt: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // 2. Legacy path
    const query = db.collection("ecommerce_keys")
      .where("platform", "==", "mercadolivre")
      .where("user_id", "==", String(userId));
      
    const qs = await query.get();

    if (!qs.empty) {
      qs.docs.forEach(doc => {
        batch.set(doc.ref, {
          status: "disconnected",
          connected: false,
          access_token: null,
          refresh_token: null,
          accessToken: null,
          refreshToken: null,
          disconnectedAt: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });
    }

    await batch.commit();

    return res.status(200).json({
      ok: true,
      connected: false
    });
  } catch (error: any) {
    console.error("ML_ERROR", "ML_DISCONNECT_ERROR", error.message);
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
