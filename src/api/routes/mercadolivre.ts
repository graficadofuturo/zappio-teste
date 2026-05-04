import { Router } from "express";
import { getAdminDb, removeUndefinedDeep } from "../firebaseAdmin.ts";
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
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const { userId } = req.query;

    if (!userId || userId === "undefined") {
      return res.status(400).json({
        ok: false,
        connected: false,
        error: "missing_uid"
      });
    }

    const db = getAdminDb();
    const docRef = db.doc(`users/${userId}/integrations/mercadolivre`);
    const docSnap = await docRef.get();
    
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

    return res.status(200).json({
      ok: true,
      connected: true,
      integration: {
        uid: userId,
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
      return res.json({ ok: false, error: "missing_uid" });
    }
    const db = getAdminDb();
    const path = `users/${uid}/integrations/mercadolivre_debug`;
    const docRef = db.doc(path);
    await docRef.set({ test: true, timestamp: new Date().toISOString() });
    const snap = await docRef.get();
    
    return res.json({
      ok: true,
      path,
      write: true,
      read: snap.exists,
      exists: snap.exists
    });
  } catch (error: any) {
    return res.json({ ok: false, error: error.message, path: `users/${req.query.uid}/integrations/mercadolivre_debug` });
  }
});

router.get("/auth-url", async (req, res) => {
  try {
    const clientId = process.env.ML_CLIENT_ID;
    const redirectUri = process.env.ML_REDIRECT_URI;
    const { userId } = req.query;

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

    const stateBase = crypto.randomUUID();
        
    const stateObj = { uid: userId, nonce: stateBase };
    const stateStr = JSON.stringify(stateObj);
    const state = encodeURIComponent(Buffer.from(stateStr).toString('base64'));
    
    console.log("ML_AUTH_STATE_CREATED", { hasUid: !!userId, uid: userId });

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

    if (!tokenRes.ok) {
      return sendHtml("error", "Falha ao trocar código por token");
    }

    const tokenData: any = await tokenRes.json();
    console.log("ML_TOKEN_OK", { hasAccessToken: !!tokenData.access_token });

    const userRes = await fetch("https://api.mercadolibre.com/users/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userRes.ok) {
      return sendHtml("error", "Falha ao buscar usuário no Mercado Livre");
    }

    const usersMe: any = await userRes.json();
    console.log("ML_USERS_ME_OK", { mlUserId: usersMe.id, nickname: usersMe.nickname });

    let userId = "unknown";
    if (state) {
      try {
        const decodedStr = Buffer.from(String(state), 'base64').toString('utf8');
        const decoded = JSON.parse(decodedStr);
        if (decoded && decoded.uid) {
          userId = decoded.uid;
        }
      } catch (e) {
        // Fallback for previous formats
        if (typeof state === "string" && state.includes("__")) {
          userId = state.split("__")[1];
        } else {
          try {
             const decodedStr = Buffer.from(String(state), 'base64url').toString('utf8');
             const decoded = JSON.parse(decodedStr);
             if (decoded && decoded.uid) {
               userId = decoded.uid;
             }
          } catch(e2) {}
        }
      }
    }

    console.log("ML_CALLBACK_STATE_DECODED", { uid: userId, hasUid: !!userId && userId !== "unknown" });

    if (userId === "unknown" || !userId || userId === "undefined") {
       console.error("ML_CALLBACK_SAVE_ERROR", "User ID not found in state");
       return sendHtml("missing_uid", "Usuário Firebase não identificado no retorno do OAuth");
    }

    const db = getAdminDb();

    const data: any = {
      marketplace: "mercadolivre",
      connected: true,
      uid: userId,
      mlUserId: usersMe.id,
      nickname: usersMe.nickname || null,
      email: usersMe.email || null,
      firstName: usersMe.first_name || null,
      lastName: usersMe.last_name || null,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      tokenType: tokenData.token_type || null,
      expiresIn: tokenData.expires_in || null,
      scope: tokenData.scope || null,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const path = `users/${userId}/integrations/mercadolivre`;
    console.log("ML_FIRESTORE_SAVE_START", { path });

    try {
      // Save directly with getAdminDb()
      await db.doc(path).set(data);
      console.log("ML_FIRESTORE_SAVE_SUCCESS", { path });
    } catch (dbErr: any) {
      console.error("ML_FIRESTORE_SAVE_ERROR", { 
        message: dbErr?.message, 
        code: dbErr?.code,
        stack: dbErr?.stack, 
        uid: userId,
        path: userId ? `users/${userId}/integrations/mercadolivre` : null
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

    return res.status(200).json({
      ok: true,
      connected: false,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Remove unused /sync as not requested? No, I'll keep it untouched or at the bottom.
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
