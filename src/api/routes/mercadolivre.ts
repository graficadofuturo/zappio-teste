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

    console.log("ML_STATUS_RESULT", { userId });

    let docData: any = null;

    if (userId && userId !== "undefined") {
      const docRef = db
        .collection("integrations")
        .doc(String(userId))
        .collection("marketplaces")
        .doc("mercadolivre");
      
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        docData = docSnap.data();
      }
    }
    
    // Fallback if not found or no userId
    if (!docData) {
      const fallbackRef = db.collection("marketplace_integrations").doc("mercadolivre");
      const fallbackSnap = await fallbackRef.get();
      if (fallbackSnap.exists) {
        // If it was saved with a specific userId but read globally, we might want to check it, 
        // but let's just return it if it's the global fallback
        docData = fallbackSnap.data();
      }
    }

    if (!docData || (docData.connected !== true && docData.status !== "connected")) {
      return res.status(200).json({
        ok: true,
        connected: false,
        marketplace: "mercadolivre",
      });
    }

    const result = {
      ok: true,
      connected: true,
      marketplace: "mercadolivre",
      mlUserId: docData.mlUserId || docData.ml_user_id || docData.seller_id,
      nickname: docData.nickname || null,
      email: docData.email || null,
      connectedAt: docData.connectedAt || docData.connected_at || null,
    };

    console.log("ML_STATUS_RESULT", result);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("ML_STATUS_ERROR", error.message);
    return res.status(200).json({
      ok: true,
      connected: false,
      marketplace: "mercadolivre",
      error: error.message,
    });
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
        
    const state = userId ? `${stateBase}__${userId}` : stateBase;
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
          <p style="color: #4b5563; margin-bottom: 0;">Esta janela deve fechar automaticamente.</p>
        </div>
        <script>
          if (window.opener) {
            ${success ? `window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');` : ""}
            setTimeout(function() { window.close(); }, 1500);
          } else {
            window.location.href = '${APP_BASE_URL}/integrations?mercadolivre=${status}';
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
    if (state && typeof state === 'string' && state.includes("__")) {
      userId = state.split("__")[1];
    }

    const { getAdminFirestore } = await import("../firebaseAdmin.ts");
    const db = getAdminFirestore();

    const data: any = {
      marketplace: "mercadolivre",
      connected: true,
      status: "connected",
      mlUserId: String(mlUser.id),
      nickname: mlUser.nickname,
      accessToken: tokenData.access_token,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (mlUser.email) data.email = mlUser.email;
    if (tokenData.refresh_token) data.refreshToken = tokenData.refresh_token;
    if (tokenData.expires_in) {
      data.expiresIn = tokenData.expires_in;
      data.expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    }
    
    // Save to the standardized path
    if (userId && userId !== "unknown") {
      await db
        .collection("integrations")
        .doc(userId)
        .collection("marketplaces")
        .doc("mercadolivre")
        .set(data, { merge: true });
    } else {
      await db
        .collection("marketplace_integrations")
        .doc("mercadolivre")
        .set(data, { merge: true });
    }

    return sendHtml("connected");
  } catch (error: any) {
    return sendHtml("error");
  }
});

router.post("/disconnect", async (req, res) => {
  try {
    const db = getAdminFirestore();
    const { userId } = req.query;

    const batch = db.batch();

    // 1. New user path
    if (userId && userId !== "undefined") {
      const docRef = db
        .collection("integrations")
        .doc(String(userId))
        .collection("marketplaces")
        .doc("mercadolivre");
      batch.set(
        docRef,
        {
          status: "disconnected",
          connected: false,
          accessToken: null,
          refreshToken: null,
          disconnectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    // 2. Global fallback path
    const fallbackRef = db.collection("marketplace_integrations").doc("mercadolivre");
    batch.set(
      fallbackRef,
      {
        status: "disconnected",
        connected: false,
        accessToken: null,
        refreshToken: null,
        disconnectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    // 3. Legacy path just in case we still have ecommerce_keys sticking around locally
    if (userId && userId !== "undefined") {
      const query = db
        .collection("ecommerce_keys")
        .where("platform", "==", "mercadolivre")
        .where("user_id", "==", String(userId));

      const qs = await query.get();

      if (!qs.empty) {
        qs.docs.forEach((doc) => {
          batch.set(
            doc.ref,
            {
              status: "disconnected",
              connected: false,
              access_token: null,
              refresh_token: null,
              accessToken: null,
              refreshToken: null,
              disconnectedAt: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        });
      }
    }

    await batch.commit();

    console.log("ML_DISCONNECT_SUCCESS", { userId });

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
