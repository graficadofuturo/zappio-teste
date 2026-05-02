import { Router } from "express";
import { getAdminDb, removeUndefinedDeep } from "../firebaseAdmin.ts";

const router = Router();

router.get("/debug-config", (req, res) => {
  res.json({
    hasClientId: !!process.env.ML_CLIENT_ID,
    hasClientSecret: !!process.env.ML_CLIENT_SECRET,
    redirectUri: process.env.ML_REDIRECT_URI,
    appBaseUrl: process.env.APP_BASE_URL,
    webhookUrl: process.env.ML_WEBHOOK_URL
  });
});

router.get("/debug-auth-url", (req, res) => {
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;

  const missing = {
    clientId: !clientId,
    redirectUri: !redirectUri,
  };

  if (!clientId || !redirectUri) {
    res.status(500).json({
      ok: false,
      error: "missing_config",
      missing,
    });
    return;
  }

  const state = "debug-state";

  const authorizationUrl =
    "https://auth.mercadolivre.com.br/authorization" +
    "?response_type=code" +
    "&client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&state=" + encodeURIComponent(state);

  res.json({
    ok: true,
    redirectUri,
    authorizationUrl,
    expectedRedirectUri: "https://zappio-teste.vercel.app/api/integrations/mercadolivre/callback",
    containsVercelDomain: authorizationUrl.includes("zappio-teste.vercel.app"),
    containsOldRunAppDomain: authorizationUrl.includes("ais-pre-jgg5kfa6ozln2cfdkicjmx-62492944237.us-west2.run.app"),
  });
});

router.get("/status", async (req, res) => {
  try {
    const db = await getAdminDb();

    const qs = await db.collection("ecommerce_keys")
      .where("platform", "==", "mercadolivre")
      .where("status", "==", "connected")
      .limit(1)
      .get();

    if (qs.empty) {
      res.status(200).json({ connected: false });
      return;
    }

    const doc = qs.docs[0].data();

    res.status(200).json({
      connected: true,
      platform: "mercadolivre",
      seller_id: doc.seller_id,
      account_name: doc.account_name,
      nickname: doc.nickname,
      site_id: doc.site_id,
      connected_at: doc.connected_at,
      updated_at: doc.updated_at
    });
  } catch (error: any) {
    if (error?.code === 5 || (error?.message && error.message.includes('NOT_FOUND'))) {
      res.status(200).json({ connected: false });
      return;
    }
    console.error("ML_STATUS_ERROR", error);
    res.status(500).json({ connected: false, error: error.message });
  }
});

router.get("/ping", (req, res) => {
  res.send("Mercado Livre API OK");
});

  router.get("/connect", async (req, res) => {
  try {
    const { userId } = req.query;
    const { randomBytes } = await import("crypto");
    const state = randomBytes(16).toString("hex");
    res.cookie('ml_oauth_state', JSON.stringify({ state, userId: userId ? String(userId) : "unknown" }), { httpOnly: true, maxAge: 1000 * 60 * 10, sameSite: 'lax', secure: true });

    const redirectUri = process.env.ML_REDIRECT_URI || "https://zappio-teste.vercel.app/api/integrations/mercadolivre/callback";
    const clientId = process.env.ML_CLIENT_ID || "";
    const authorizationUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    
    res.redirect(authorizationUrl);
  } catch (e: any) {
    console.error("[ML OAuth] Connect route error:", e);
    const APP_BASE_URL = process.env.APP_BASE_URL || "https://zappio-teste.vercel.app";
    res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=error`);
  }
});

router.get("/callback", async (req, res) => {
  const APP_BASE_URL = process.env.APP_BASE_URL || "https://zappio-teste.vercel.app";
  const integrationsPath = "/dashboard/integrations";
  const redirectUri = process.env.ML_REDIRECT_URI || "https://zappio-teste.vercel.app/api/integrations/mercadolivre/callback";
  try {
    const { code, state, error, error_description } = req.query;

    if (error || error_description) {
       res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=error`);
       return;
    }

    if (!code) {
       res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=missing_code`);
       return;
    }

    const cookieDataStr = req.headers.cookie?.split('; ').find(row => row.startsWith('ml_oauth_state='))?.split('=')[1];
    let validState = false;
    let userId: string | null = null;
    let cookieData: any = {};
    if (cookieDataStr) {
        try {
            cookieData = JSON.parse(decodeURIComponent(cookieDataStr));
            if (cookieData.state === state) {
                validState = true;
                userId = cookieData.userId;
            }
        } catch (e) {}
    }

    const clientId = process.env.ML_CLIENT_ID || "";
    const clientSecret = process.env.ML_CLIENT_SECRET || "";

    if (!clientId || !clientSecret) {
        console.error("ML credentials not configured");
        res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=config_error`);
        return;
    }

    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: code as string,
            redirect_uri: redirectUri
        }).toString()
    });

    if (!tokenRes.ok) {
        console.error("Failed to exchange code. Status:", tokenRes.status);
        res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=token_error`);
        return;
    }

    const tokenData: any = await tokenRes.json();

    let mlUser = {} as any;
    try {
        const userRes = await fetch('https://api.mercadolibre.com/users/me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (userRes.ok) mlUser = await userRes.json();
        else {
            res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=user_error`);
            return;
        }
    } catch (err) {
        res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=user_error`);
        return;
    }

    const db = await getAdminDb();

    try {
        const sellerId = mlUser.id?.toString() || tokenData.user_id?.toString() || tokenData.seller_id;
        const accountName = mlUser.first_name ? `${mlUser.first_name} ${mlUser.last_name || ''}`.trim() : mlUser.nickname;
        const nickname = mlUser.nickname;
        const siteId = mlUser.site_id;
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const expiresIn = tokenData.expires_in;

        const integrationData = removeUndefinedDeep({
          user_id: userId || 'unknown',
          platform: "mercadolivre",
          seller_id: String(sellerId),
          account_name: accountName || null,
          nickname: nickname || null,
          site_id: siteId || null,
          access_token: accessToken || null,
          refresh_token: refreshToken || null,
          expires_in: expiresIn || null,
          token_expires_at: expiresIn
            ? new Date(Date.now() + expiresIn * 1000).toISOString()
            : null,
          status: "connected",
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        await db
          .collection("ecommerce_keys")
          .doc(String(sellerId))
          .set(integrationData, { merge: true });
          
    } catch (saveErr: any) {
        console.error("ML_FIRESTORE_SAVE_ERROR", saveErr);
        res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
        return;
    }

    res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=connected`);
  } catch (e: any) {
    console.error("ML_CALLBACK_EXCEPTION", e);
    res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=callback_exception`);
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
