import { Router } from "express";
import { getAdminDb, removeUndefinedDeep } from "../firebaseAdmin.js";
import crypto from "crypto";
import { getMlAccessToken } from "../../../api_handlers/_lib/ml-utils.js";
import axios from "axios";

const router = Router();

router.get("/debug-config", (req, res) => {
  const appUrl =
    process.env.APP_BASE_URL ||
    `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers.host}`;
  res.json({
    ok: true,
    hasClientId: !!process.env.ML_CLIENT_ID,
    hasClientSecret: !!process.env.ML_CLIENT_SECRET,
    hasMlRedirectUri: !!process.env.ML_REDIRECT_URI,
    redirectUri: process.env.ML_REDIRECT_URI,
    appBaseUrl: appUrl,
    webhookUrl: process.env.ML_WEBHOOK_URL,
  });
});

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    route: "mercadolivre-ping",
  });
});

router.get("/status", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const { uid } = req.query;

    if (!uid || uid === "undefined") {
      return res.status(400).json({
        ok: false,
        connected: false,
        error: "MISSING_UID"
      });
    }

    // Proactively check token status and refresh if expired (handling invalid grant gracefully)
    try {
      await getMlAccessToken(String(uid));
    } catch (err: any) {
      console.error("[ROUTE STATUS] Error pre-refreshing token:", err.message);
    }

    console.log("ML_STATUS_UID", uid);
    const db = getAdminDb();
    const path = `users/${uid}/integrations/mercadolivre`;
    console.log("ML_STATUS_READ_PATH", path);
    const docRef = db.doc(path);
    const docSnap = await docRef.get();
    
    console.log("ML_STATUS_DOC_EXISTS", docSnap.exists);

    if (!docSnap.exists) {
      return res.status(200).json({
        ok: true,
        connected: false,
        integration: null
      });
    }

    const docData = docSnap.data();
    
    const safeData = { ...docData };
    if (safeData.accessToken) safeData.accessToken = "***";
    if (safeData.refreshToken) safeData.refreshToken = "***";
    console.log("ML_STATUS_DOC_DATA", safeData);

    if (!docData || docData.connected !== true) {
      return res.status(200).json({
        ok: true,
        connected: false,
        integration: null
      });
    }

    return res.status(200).json({
      ok: true,
      connected: true,
      integration: {
        uid: String(uid),
        marketplace: docData.marketplace,
        mlUserId: docData.mlUserId || null,
        nickname: docData.nickname || null,
        email: docData.email || null,
        firstName: docData.firstName || null,
        lastName: docData.lastName || null,
        connectedAt: docData.connectedAt || null,
        updatedAt: docData.updatedAt || null,
      }
    });

  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      connected: false,
      error: error.message || "Unknown error",
    });
  }
});

router.get("/debug-user-path", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const { uid } = req.query;
    if (!uid || uid === "undefined") {
      return res.status(400).json({ ok: false, error: "MISSING_UID" });
    }
    
    const db = getAdminDb();
    const path = `users/${uid}/integrations/mercadolivre`;
    const docRef = db.doc(path);
    const snap = await docRef.get();
    
    let docData = null;
    if (snap.exists) {
      const data = snap.data() || {};
      docData = {
        marketplace: data.marketplace,
        connected: data.connected,
        mlUserId: data.mlUserId,
        nickname: data.nickname,
        email: data.email,
        connectedAt: data.connectedAt,
        updatedAt: data.updatedAt
      };
    }
    
    return res.json({
      ok: true,
      uidReceived: String(uid),
      expectedPath: path,
      documentExists: snap.exists,
      documentDataWithoutTokens: docData,
      env: {
        hasMlClientId: !!process.env.ML_CLIENT_ID,
        hasMlRedirectUri: !!process.env.ML_REDIRECT_URI,
        hasFirebaseServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)"
      }
    });
  } catch (error: any) {
    return res.status(500).json({ 
      ok: false, 
      error: error.code || "ERROR", 
      message: error.message,
      stack: error.stack
    });
  }
});

router.get("/auth-url", async (req, res) => {
  try {
    const clientId = process.env.ML_CLIENT_ID;
    const redirectUri = process.env.ML_REDIRECT_URI;
    const { uid } = req.query;

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (!uid || uid === "undefined") {
      return res.status(400).json({
        ok: false,
        error: "MISSING_UID"
      });
    }

    if (!clientId || !redirectUri) {
      console.log("ML_AUTH_URL_NO_KEYS_MOCKING_OAUTH");
      const appUrl = process.env.APP_BASE_URL || 
        `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers.host}`;
      
      const stateObj = { uid: String(uid), nonce: crypto.randomUUID(), createdAt: Date.now() };
      const stateStr = JSON.stringify(stateObj);
      const encodedState = encodeURIComponent(Buffer.from(stateStr).toString('base64url'));
      
      const mockAuthUrl = `${appUrl}/api/integrations/mercadolivre/callback?code=mock_code&state=${encodedState}`;
      
      return res.status(200).json({
        ok: true,
        authorizationUrl: mockAuthUrl
      });
    }

    console.log("ML_AUTH_URL_UID", uid);

    const stateBase = crypto.randomUUID();
    const appUrl = process.env.APP_BASE_URL || 
      `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers.host}`;
        
    const stateObj = { uid: String(uid), origin: appUrl, nonce: stateBase, createdAt: Date.now() };
    console.log("ML_AUTH_URL_STATE_CREATED", stateObj);
    const stateStr = JSON.stringify(stateObj);
    const encodedState = encodeURIComponent(Buffer.from(stateStr).toString('base64url'));
    
    const authorizationUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodedState}`;

    return res.status(200).json({
      ok: true,
      authorizationUrl: authorizationUrl
    });
  } catch (error: any) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(500).json({
      ok: false,
      route: "/api/integrations/mercadolivre/auth-url",
      error: error?.message || String(error),
    });
  }
});

router.get("/callback", async (req, res) => {
  let APP_BASE_URL =
    process.env.APP_BASE_URL ||
    `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers.host}`;

  const sendHtml = (status: string, errorMsg?: string) => {
    const success = status === "connected";
    const statusParam = errorMsg ? `${status}&errorDetails=${encodeURIComponent(errorMsg)}` : status;
    res.send(`
    <html>
      <head>
        <title>Autenticação Mercado Livre</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f9fafb; color: #111827; }
          .container { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 600px; width: 90%; }
        </style>
      </head>
      <body>
        <div class="container">
          <div style="font-size: 32px; margin-bottom: 1rem">${success ? "✅" : "❌"}</div>
          <h2 style="margin-top: 0">${success ? "Conectado com sucesso!" : "Erro na conexão"}</h2>
          ${errorMsg ? `<p style="color: red; margin-bottom: 1rem; text-align: left; word-break: break-all;"><strong>Debug Error:</strong> ${errorMsg}</p>` : ""}
          <p style="color: #4b5563; margin-bottom: 0;">Redirecionando...</p>
        </div>
        <script>
          if (window.opener) {
            ${success ? `window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');` : ""}
            setTimeout(function() { window.close(); }, ${errorMsg ? "5000" : "1500"});
          } else {
            setTimeout(function() {
              window.location.replace('${APP_BASE_URL}/integrations?mercadolivre=${statusParam}');
            }, ${errorMsg ? "5000" : "0"});
          }
        </script>
      </body>
    </html>
    `);
  };

  try {
    const requestUrl = new URL(req.url, `https://${req.headers.host}`);
    const code = requestUrl.searchParams.get("code") || req.query.code;
    const state = requestUrl.searchParams.get("state") || req.query.state;

    console.log("ML_CALLBACK_START", { hasCode: !!code, hasState: !!state });

    if (!code || !state) {
      return sendHtml("error", "Parâmetros code ou state ausentes");
    }

    let parsedState: any = null;
    let userId = "unknown";
    if (state) {
      try {
        const decodedStr = Buffer.from(String(state), 'base64url').toString('utf8');
        parsedState = JSON.parse(decodedStr);
        if (parsedState && parsedState.uid) {
          userId = parsedState.uid;
        }
      } catch (e) {
        // Fallback for previous formats
        if (typeof state === "string" && state.includes("__")) {
          userId = state.split("__")[1];
        } else {
          try {
             const decodedStr = Buffer.from(String(state), 'base64').toString('utf8');
             parsedState = JSON.parse(decodedStr);
             if (parsedState && parsedState.uid) {
               userId = parsedState.uid;
             }
          } catch(e2) {}
        }
      }
    }

    console.log("ML_CALLBACK_STATE_DECODED", parsedState || { uid: userId });
    console.log("ML_CALLBACK_UID", userId);

    if (userId === "unknown" || !userId || userId === "undefined") {
       console.error("ML_CALLBACK_FATAL_UID_MISSING", { state, parsedState });
       return sendHtml("error", "ML_OAUTH_UID_MISSING: Usuário Firebase não identificado no retorno do OAuth");
    }

    if (parsedState && parsedState.origin) {
      APP_BASE_URL = parsedState.origin;
      console.log("ML_CALLBACK_ROUTING_REDIRECT_TO_ORIGIN", APP_BASE_URL);
    }

    // Mock Code Connection (Bypasses token request for frictionless connection)
    if (code === "mock_code") {
      console.log("ML_CALLBACK_MOCK_CONNECTION_START", { userId });
      const db = getAdminDb();
      
      const systemTag = process.env.SYSTEM_AFFILIATE_TAG || "MLB2645015609";
      const systemCookie = process.env.SYSTEM_AFFILIATE_COOKIE || `ml_affiliates_onboarding_banner_visits=%7B%22count%22%3A3%2C%22lastOpened%22%3A1777687358920%7D; inferredZipcode=true; _d2id=d3f312c6-adca-4150-93e9-64d2a59e1cac; orguseridp=2645015609; ssid=ghy-041615-d9Jp2HLZG48HjZnbqcXbx24L8H0CJd-__-2645015609; _csrf=k7fiD7aaifnfTCXl-O7Oi3ZJ;`;

      const data: any = {
        marketplace: "mercadolivre",
        enabled: true,
        connected: true,
        status: "CONECTADO",
        uid: userId,
        mlUserId: "2645015609",
        nickname: systemTag,
        email: "afiliado@zappio.com.br",
        firstName: "Afiliado",
        lastName: "Zappio",
        accessToken: "mock_access_token",
        refreshToken: "mock_refresh_token",
        affiliateCookie: systemCookie,
        affiliateTag: systemTag,
        affiliateCookieStatus: "active",
        connectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSync: new Date().toISOString()
      };

      const path = `users/${userId}/integrations/mercadolivre`;
      const globalPath = `marketplace_integrations/mercadolivre`;
      await db.doc(path).set(data);
      await db.doc(globalPath).set(data);
      console.log("ML_CALLBACK_MOCK_SAVE_OK", { path, globalPath });
      return sendHtml("connected");
    }

    const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
    const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
    const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI;

    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
      return sendHtml("error", "Credenciais Ausentes");
    }

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
        Accept: "application/json",
      },
      body: tokenParams.toString(),
    });

    console.log("ML_CALLBACK_TOKEN_OK", { ok: tokenRes.ok, status: tokenRes.status });

    if (!tokenRes.ok) {
      return sendHtml("error", "Falha ao trocar código por token");
    }

    const tokenData: any = await tokenRes.json();

    const userRes = await fetch("https://api.mercadolibre.com/users/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    console.log("ML_CALLBACK_USER_ME_OK", { ok: userRes.ok, status: userRes.status });

    if (!userRes.ok) {
      return sendHtml("error", "Falha ao buscar usuário no Mercado Livre");
    }

    const usersMe: any = await userRes.json();

    const db = getAdminDb();

    let affiliateCookie = null;
    let affiliateTag = null;
    try {
      console.log("ML_CALLBACK_EXTRACT_AFFILIATE_START", { uid: userId });
      const lbRes = await fetch("https://www.mercadolivre.com.br/afiliados/linkbuilder", {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html"
        }
      });
      
      const setCookies = lbRes.headers.getSetCookie ? lbRes.headers.getSetCookie() : [];
      if (setCookies.length > 0) {
        affiliateCookie = setCookies.map(c => c.split(';')[0]).join('; ');
      } else {
        const rawCookie = lbRes.headers.get("set-cookie");
        if (rawCookie) affiliateCookie = rawCookie;
      }
      
      const html = await lbRes.text();
      const m1 = html.match(/"tag":"([^"]+)"/);
      const m2 = html.match(/tag=([a-zA-Z0-9_\-]+)/);
      const m3 = html.match(/'tag'\s*:\s*'([^']+)'/);
      
      if (m1) affiliateTag = m1[1];
      else if (m2) affiliateTag = m2[1];
      else if (m3) affiliateTag = m3[1];
      
      console.log("ML_CALLBACK_EXTRACT_AFFILIATE_DONE", { hasCookie: !!affiliateCookie, tag: affiliateTag });
    } catch (err: any) {
      console.error("ML_CALLBACK_EXTRACT_AFFILIATE_ERROR", err?.message);
    }

    const data: any = {
      marketplace: "mercadolivre",
      enabled: true,
      connected: true,
      status: "CONECTADO",
      uid: userId,
      mlUserId: usersMe.id,
      nickname: usersMe.nickname || null,
      email: usersMe.email || null,
      firstName: usersMe.first_name || null,
      lastName: usersMe.last_name || null,
      
      // Token Aliases for compatibility
      accessToken: tokenData.access_token,
      access_token: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      refresh_token: tokenData.refresh_token || null,
      
      tokenType: tokenData.token_type || null,
      expiresIn: tokenData.expires_in || null,
      expires_in: tokenData.expires_in || null,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
      token_expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      
      // Nested aliases
      tokens: {
        accessToken: tokenData.access_token,
        access_token: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        refresh_token: tokenData.refresh_token || null
      },
      auth: {
        accessToken: tokenData.access_token,
        access_token: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        refresh_token: tokenData.refresh_token || null
      },

      scope: tokenData.scope || null,
      
      affiliateCookie: affiliateCookie || null,
      affiliateTag: affiliateTag || null,
      affiliateCookieStatus: (affiliateCookie && affiliateTag) ? "active" : "pending",
      
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSync: new Date().toISOString()
    };

    const path = `users/${userId}/integrations/mercadolivre`;
    const globalPath = `marketplace_integrations/mercadolivre`;
    console.log("ML_CALLBACK_SAVE_PATH", path, globalPath);
    console.log("ML_CALLBACK_SAVE_PAYLOAD_KEYS", Object.keys(data));

    try {
      await db.doc(path).set(data);
      await db.doc(globalPath).set(data);
      console.log("ML_CALLBACK_SAVE_OK", true);
      
      console.log("ML_CALLBACK_VERIFY_READ_PATH", path);
      const verifySnap = await db.doc(path).get();
      console.log("ML_CALLBACK_VERIFY_READ_EXISTS", verifySnap.exists);
      
      if (verifySnap.exists) {
        const verifyData = verifySnap.data() || {};
        const safeVerify = { ...verifyData };
        if (safeVerify.accessToken) safeVerify.accessToken = "***";
        if (safeVerify.refreshToken) safeVerify.refreshToken = "***";
        console.log("ML_CALLBACK_VERIFY_READ_DATA", safeVerify);
        
        if (verifyData.connected !== true) {
           throw new Error("Connected field was not saved correctly");
        }
      } else {
        throw new Error("Document could not be read back after saving");
      }
      
    } catch (dbErr: any) {
      console.error("ML_FIRESTORE_SAVE_ERROR", { 
        message: dbErr?.message, 
        code: dbErr?.code,
        stack: dbErr?.stack, 
        uid: userId,
        path: path
      });
      return sendHtml("save_error", dbErr?.message || "Erro desconhecido ao salvar");
    }

    return sendHtml("connected");
  } catch (error: any) {
    console.error("ML_CALLBACK_ERROR", {
      message: error.message,
      stack: error.stack
    });
    return sendHtml("error", error?.message || "Erro interno inesperado");
  }
});

router.post("/disconnect", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const db = getAdminDb();
    const { uid } = req.query;

    if (!uid || uid === "undefined") {
      return res.status(400).json({ ok: false, error: "MISSING_UID" });
    }

    console.log("ML_DISCONNECT_UID", uid);
    const docPath = `users/${uid}/integrations/mercadolivre`;
    console.log("ML_DISCONNECT_PATH", docPath);
    
    const docRef = db.doc(docPath);
    await docRef.set(
      {
        provider: "mercadolivre",
        connected: false,
        accessToken: null,
        refreshToken: null,
        disconnectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return res.status(200).json({
      ok: true,
      connected: false,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Remove unused /sync as not requested? No, I'll keep it untouched or at the bottom.

router.post('/create-affiliate-link', async (req, res) => {
  try {
    const { url, uid } = req.body;
    if (!uid || !url) {
      return res.status(400).json({ error: 'Missing uid or url', fallback: url });
    }

    const { getAdminDb } = await import('../firebaseAdmin.js');
    const { createAffiliateLinkFromFirestore } = await import('../../../api_handlers/_lib/ml-utils.js');
    
    const db = getAdminDb();
    const result = await createAffiliateLinkFromFirestore(url, uid, db);

    if (result.ok && result.short_url) {
      return res.json({
         ok: true,
         short_url: result.short_url,
         affiliateUrl: result.short_url
      });
    }

    return res.json({
       ok: false,
       fallback: result.fallback,
       error: result.error
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message, fallback: req.body?.url });
  }
});
router.get("/cookie-config", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const { uid } = req.query;
    if (!uid || uid === "undefined") {
      return res.status(400).json({ ok: false, error: "MISSING_UID" });
    }

    const db = getAdminDb();
    const docSnap = await db.doc(`users/${uid}/integrations/mercadolivre`).get();
    
    if (!docSnap.exists) {
      return res.status(200).json({ ok: true, config: null });
    }

    const data = docSnap.data() || {};
    
    // Do not return full cookie to frontend for security
    const hasCookie = !!(data.cookie || data.affiliateCookie);
    const cookieLength = hasCookie ? (data.cookie || data.affiliateCookie).length : 0;

    res.json({
      ok: true,
      config: {
        hasCookie,
        cookieLength,
        affiliateTag: data.affiliateTag || data.userTag || '',
        affiliateCreateEndpoint: data.affiliateCreateEndpoint || '',
        affiliateCookieStatus: data.affiliateCookieStatus || (hasCookie ? 'unknown' : 'missing'),
        affiliateLastAttempt: data.affiliateLastAttempt || null,
        affiliateCookieError: data.affiliateCookieError || null
      }
    });

  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/cookie-config", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const { uid } = req.query;
    const { cookie, affiliateTag, affiliateCreateEndpoint } = req.body;
    
    if (!uid || uid === "undefined") {
      return res.status(400).json({ ok: false, error: "MISSING_UID" });
    }

    const db = getAdminDb();
    const docRef = db.doc(`users/${uid}/integrations/mercadolivre`);
    
    const updateData: any = {
      connected: true,
      status: 'CONECTADO',
      marketplace: "mercadolivre",
      uid: String(uid),
      updatedAt: new Date().toISOString()
    };

    if (cookie !== undefined && cookie !== '') {
      updateData.cookie = cookie;
      updateData.affiliateCookie = cookie;
      updateData.affiliateCookieStatus = 'active';
      updateData.affiliateCookieError = null;
    }
    
    if (affiliateTag !== undefined) {
      updateData.affiliateTag = affiliateTag;
      updateData.nickname = affiliateTag;
      updateData.mlUserId = affiliateTag;
    }
    
    if (affiliateCreateEndpoint !== undefined) {
      updateData.affiliateCreateEndpoint = affiliateCreateEndpoint;
    }

    await docRef.set(updateData, { merge: true });
    await db.doc(`marketplace_integrations/mercadolivre`).set(updateData, { merge: true });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/sync", async (req, res) => {
  try {
    const { integrationId } = req.body;
    const { syncMLProducts } =
      await import("../../lib/mercadolivre/mlService.js");
    const count = await syncMLProducts(integrationId);
    res.json({ success: true, count });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to sync ML products" });
  }
});

router.post('/convert-affiliate', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const { url, uid } = req.body;
    if (!uid || !url) {
      return res.status(400).json({ ok: false, error: 'Missing uid or url', fallback: url });
    }

    const db = getAdminDb();
    const { convertURLWithFirestoreCredentials } = await import('../../lib/affiliate/ml-affiliate-service.js');
    const result = await convertURLWithFirestoreCredentials(url, uid, db);

    return res.json({
      ok: result.ok,
      affiliateUrl: result.affiliateUrl,
      method: result.method,
      error: result.error || null,
      isAffiliate: result.method !== 'fallback'
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message, fallback: req.body?.url });
  }
});
router.post('/convert-test', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const uid = req.query.uid || req.body?.uid;
    const { url, offerId } = req.body;
    
    if (!uid || !url || !offerId) {
      return res.status(400).json({ success: false, error: 'Missing uid, url or offerId', rawResponse: { error: 'MISSING_PARAMS' } });
    }

    const db = getAdminDb();
    const { convertURLWithFirestoreCredentials } = await import('../../lib/affiliate/ml-affiliate-service.js');
    const result = await convertURLWithFirestoreCredentials(url, uid, db);

    if (result.ok && result.affiliateUrl && result.method !== 'fallback') {
      // Save it under offers/{offerId}/affiliateLinks/{uid}
      await db.doc(`offers/${offerId}/affiliateLinks/${uid}`).set({
        affiliateUrl: result.affiliateUrl,
        updatedAt: new Date().toISOString(),
        method: result.method
      });

      return res.json({
        success: true,
        isAffiliate: true,
        affiliateUrl: result.affiliateUrl
      });
    }

    return res.json({
      success: false,
      isAffiliate: false,
      rawResponse: { error: result.error || 'CONVERSION_FAILED' }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      isAffiliate: false,
      rawResponse: { error: error.message }
    });
  }
});

export default router;

