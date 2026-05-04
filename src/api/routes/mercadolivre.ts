import { Router } from "express";
import { getAdminFirestore, removeUndefinedDeep } from "../firebaseAdmin.ts";
import crypto from "crypto";

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
  try {
    const db = getAdminFirestore();
    const { userId } = req.query;

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (!userId || userId === "undefined") {
      return res.status(200).json({
        ok: true,
        connected: false,
        integration: null
      });
    }

    const docRef = db.doc(`users/${userId}/integrations/mercadolivre`);
      
    console.log("ML_STATUS_READ_PATH", `users/${userId}/integrations/mercadolivre`);

    const docSnap = await docRef.get();
    
    console.log("ML_STATUS_RESULT", { exists: docSnap.exists });

    if (!docSnap.exists) {
      return res.status(200).json({
        ok: true,
        connected: false,
        integration: null
      });
    }

    const docData = docSnap.data();

    if (!docData || docData.connected !== true) {
      return res.status(200).json({
        ok: true,
        connected: false,
        integration: null
      });
    }

    const formatTimestamp = (ts: any) => {
      if (!ts) return null;
      if (ts.toDate) return ts.toDate().toISOString();
      return ts;
    };

    const result = {
      ok: true,
      connected: true,
      integration: {
        provider: "mercadolivre",
        mlUserId: docData.mlUserId || null,
        nickname: docData.nickname || docData.mlNickname || null,
        email: docData.email || docData.mlEmail || null,
        connectedAt: formatTimestamp(docData.connectedAt),
        updatedAt: formatTimestamp(docData.updatedAt),
      }
    };

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("ML_STATUS_ERROR", error.message);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(500).json({
      ok: false,
      connected: false,
      integration: null,
      error: error.message || "Unknown error",
    });
  }
});

router.get("/debug-status", async (req, res) => {
  try {
    const db = getAdminFirestore();
    const { userId } = req.query;

    res.setHeader("Content-Type", "application/json; charset=utf-8");

    const response: any = {
      ok: true,
      uidDetected: userId && userId !== "undefined" ? userId : null,
      firestorePath: null,
      documentExists: false,
      documentDataPreview: null,
    };

    if (userId && userId !== "undefined") {
      const path = `users/${userId}/integrations/mercadolivre`;
      response.firestorePath = path;
      const docRef = db.doc(path);
      const docSnap = await docRef.get();
      response.documentExists = docSnap.exists;
      if (docSnap.exists) {
        const data = docSnap.data() || {};
        response.documentDataPreview = { 
          provider: data.provider,
          connected: data.connected,
          mlUserId: data.mlUserId,
          nickname: data.nickname,
          email: data.email
        };
      }
    }

    return res.status(200).json(response);
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/auth-url", async (req, res) => {
  try {
    const clientId = process.env.ML_CLIENT_ID;
    const redirectUri = process.env.ML_REDIRECT_URI;
    const { userId } = req.query;

    // Must be clean JSON, no HTML
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (!clientId || !redirectUri) {
      const missing = [];
      if (!clientId) missing.push("ML_CLIENT_ID");
      if (!redirectUri) missing.push("ML_REDIRECT_URI");

      return res.status(500).json({
        ok: false,
        error: "Missing required environment variables",
        missing: missing,
      });
    }

    const stateBase =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `ml-${Date.now()}-${Math.random()}`;
        
    const stateObj = { uid: userId, nonce: stateBase };
    const state = encodeURIComponent(JSON.stringify(stateObj));
    const authorizationUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return res.status(200).json({
      ok: true,
      authorizationUrl: authorizationUrl,
      redirectUri: redirectUri,
      state: state,
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
  const APP_BASE_URL =
    process.env.APP_BASE_URL ||
    `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers.host}`;

  const sendHtml = (status: string) => {
    // Return early closing script window or redirecting
    const success = status === "connected";
    res.send(`
    <html>
      <head>
        <title>Autenticação Mercado Livre</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f9fafb; color: #111827; }
          .container { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; width: 90%; }
        </style>
      </head>
      <body>
        <div class="container">
          <div style="font-size: 32px; margin-bottom: 1rem">${success ? "✅" : "❌"}</div>
          <h2 style="margin-top: 0">${success ? "Conectado com sucesso!" : "Erro na conexão"}</h2>
          <p style="color: #4b5563; margin-bottom: 0;">Redirecionando...</p>
        </div>
        <script>
          if (window.opener) {
            ${success ? `window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');` : ""}
            setTimeout(function() { window.close(); }, 1500);
          } else {
            window.location.replace('${APP_BASE_URL}/integrations?mercadolivre=${status}');
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

    if (!code || !state) {
      return sendHtml("error");
    }

    const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
    const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
    const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI;

    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
      return sendHtml("error");
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

    if (!tokenRes.ok) {
      return sendHtml("error");
    }

    const tokenData: any = await tokenRes.json();

    const userRes = await fetch("https://api.mercadolibre.com/users/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userRes.ok) {
      return sendHtml("error");
    }

    const mlUser: any = await userRes.json();

    let userId = "unknown";
    if (state) {
      try {
        const decoded = JSON.parse(decodeURIComponent(String(state)));
        if (decoded && decoded.uid) {
          userId = decoded.uid;
        } else if (typeof state === "string" && state.includes("__")) {
          userId = state.split("__")[1];
        }
      } catch (e) {
        if (typeof state === "string" && state.includes("__")) {
          userId = state.split("__")[1];
        }
      }
    }
    
    if (userId === "unknown" || !userId || userId === "undefined") {
       console.error("ML_CALLBACK_SAVE_ERROR", "User ID not found in state");
       return sendHtml("missing_user");
    }

    const { getAdminFirestore } = await import("../firebaseAdmin.ts");
    const { FieldValue } = await import("firebase-admin/firestore");
    const db = getAdminFirestore();

    console.log("ML_CALLBACK_START", { userId });
    console.log("ML_TOKEN_SUCCESS", { expiresIn: tokenData.expires_in });
    console.log("ML_USER_SUCCESS", { mlUserId: mlUser.id });

    const data: any = {
      provider: "mercadolivre",
      connected: true,
      mlUserId: String(mlUser.id),
      nickname: mlUser.nickname || null,
      email: mlUser.email || null,
      accessToken: tokenData.access_token || null,
      refreshToken: tokenData.refresh_token || null,
      tokenType: tokenData.token_type || null,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
      scope: tokenData.scope || null,
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const savePath = `users/${userId}/integrations/mercadolivre`;
    console.log("ML_FIRESTORE_SAVE_PATH", savePath);
    console.log("ML_CALLBACK_SAVE_DATA", { ...data, accessToken: "***", refreshToken: "***" });

    // Save to the standardized path
    try {
      await db.doc(savePath).set(data, { merge: true });
      console.log("ML_FIRESTORE_SAVE_SUCCESS", { path: savePath });
      
      const verifySnap = await db.doc(savePath).get();
      if (!verifySnap.exists) {
        throw new Error("Document was not found after saving");
      }
      console.log("ML_FIRESTORE_VERIFY_OK", { exists: verifySnap.exists });
    } catch (dbErr: any) {
      console.error("ML_FIRESTORE_SAVE_ERROR", dbErr);
      return sendHtml("save_error");
    }

    return sendHtml("connected");
  } catch (error: any) {
    console.error("ML_CALLBACK_ERROR", {
      message: error.message,
      stack: error.stack
    });
    return sendHtml("error");
  }
});

router.post("/disconnect", async (req, res) => {
  try {
    const db = getAdminFirestore();
    const { userId } = req.query;

    if (!userId || userId === "undefined") {
      return res.status(400).json({ ok: false, error: "Missing user ID" });
    }

    const docPath = `users/${userId}/integrations/mercadolivre`;
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

    console.log("ML_DISCONNECT_SUCCESS", { path: docPath });

    return res.status(200).json({
      ok: true,
      connected: false,
    });
  } catch (error: any) {
    console.error("ML_ERROR", "ML_DISCONNECT_ERROR", error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/sync", async (req, res) => {
  try {
    const { integrationId } = req.body;
    const { syncMLProducts } =
      await import("../../lib/mercadolivre/mlService.ts");
    const count = await syncMLProducts(integrationId);
    res.json({ success: true, count });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to sync ML products" });
  }
});

export default router;
