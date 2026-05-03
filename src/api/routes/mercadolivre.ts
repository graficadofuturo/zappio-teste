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

router.get("/debug-config", (req, res) => {
  const appUrl = process.env.APP_URL || process.env.APP_BASE_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
  res.json({
    ok: true,
    hasClientId: !!process.env.ML_CLIENT_ID,
    hasClientSecret: !!process.env.ML_CLIENT_SECRET,
    redirectUri: process.env.ML_REDIRECT_URI || `${appUrl}/api/integrations/mercadolivre/callback`,
    appBaseUrl: appUrl
  });
});

router.get("/auth-url", async (req, res) => {
  try {
    const { userId } = req.query;
    const { randomBytes } = await import("crypto");
    const state = randomBytes(16).toString("hex");
    res.cookie('ml_oauth_state', JSON.stringify({ state, userId: userId ? String(userId) : "unknown" }), { httpOnly: true, maxAge: 1000 * 60 * 10, sameSite: 'none', secure: true });

    const appUrl = process.env.APP_URL || process.env.APP_BASE_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
    const redirectUri = process.env.ML_REDIRECT_URI || `${appUrl}/api/integrations/mercadolivre/callback`;
    const clientId = process.env.ML_CLIENT_ID || "";
    
    console.log("ML_AUTH_URL_START", {
      hasClientId: !!process.env.ML_CLIENT_ID,
      hasClientSecret: !!process.env.ML_CLIENT_SECRET,
      redirectUri: redirectUri,
      appBaseUrl: appUrl
    });

    if (!clientId) {
      return res.json({
        ok: false,
        error: "missing_ml_client_id",
        message: "ML_CLIENT_ID não configurado."
      });
    }

    const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", state);
    
    console.log("ML_AUTH_URL_CREATED", {
      authorizationUrl: authorizationUrl.toString()
    });

    res.json({ 
      ok: true,
      authorizationUrl: authorizationUrl.toString(),
      redirectUri: redirectUri,
      hasClientId: !!clientId,
      hasRedirectUri: !!redirectUri
    });
  } catch (e: any) {
    console.error("[ML OAuth] Connect route error:", e);
    res.status(500).json({ ok: false, error: "internal_error", message: e.message });
  }
});

const getHtmlResponse = (type: string, error?: string) => `
    <html>
      <body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: '${type}', error: '${error || ""}' }, '*');
            window.close();
          } else {
            window.location.href = '/integrations${error ? '?mercadolivre=' + error : '?mercadolivre=connected'}';
          }
        </script>
        <p>Autenticação concluída. Esta janela fechará sozinha.</p>
      </body>
    </html>
`;

router.get("/callback-test", (req, res) => {
  res.json({
    ok: true,
    message: "Callback route is working"
  });
});

router.get("/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error;
  
  const appUrl = process.env.APP_URL || process.env.APP_BASE_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}`;
  const redirectUri = process.env.ML_REDIRECT_URI || `${appUrl}/api/integrations/mercadolivre/callback`;

  console.log("ML_CALLBACK_START", {
    hasCode: !!code,
    hasState: !!state,
    redirectUri: process.env.ML_REDIRECT_URI,
    appBaseUrl: process.env.APP_BASE_URL
  });

  try {
    if (error) {
       console.error("ML_CALLBACK_PROVIDER_ERROR", error);
       return res.redirect(`${appUrl}/integrations?mercadolivre=invalid_state`);
    }

    if (!code) {
       console.error("ML_CALLBACK_MISSING_CODE");
       return res.redirect(`${appUrl}/integrations?mercadolivre=missing_code`);
    }

    const clientId = process.env.ML_CLIENT_ID || "";
    const clientSecret = process.env.ML_CLIENT_SECRET || "";

    if (!clientId || !clientSecret) {
        console.error("ML credentials not configured");
        return res.redirect(`${appUrl}/integrations?mercadolivre=config_error`);
    }

    const controllerToken = new AbortController();
    const timeoutIdToken = setTimeout(() => controllerToken.abort(), 10000);

    let tokenRes: any;
    try {
      tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
          body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: clientId,
              client_secret: clientSecret,
              code: code,
              redirect_uri: redirectUri
          }).toString(),
          signal: controllerToken.signal
      });
      clearTimeout(timeoutIdToken);
    } catch (e) {
      clearTimeout(timeoutIdToken);
      console.error("ML_TOKEN_FETCH_ERROR", e);
      return res.redirect(`${appUrl}/integrations?mercadolivre=token_error`);
    }

    console.log("ML_TOKEN_RESPONSE", {
      status: tokenRes.status,
      ok: tokenRes.ok
    });

    if (!tokenRes.ok) {
        return res.redirect(`${appUrl}/integrations?mercadolivre=token_error`);
    }

    const tokenData: any = await tokenRes.json();

    const controllerUser = new AbortController();
    const timeoutIdUser = setTimeout(() => controllerUser.abort(), 10000);

    let userRes: any;
    try {
        userRes = await fetch('https://api.mercadolibre.com/users/me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
            signal: controllerUser.signal
        });
        clearTimeout(timeoutIdUser);
    } catch (err) {
        clearTimeout(timeoutIdUser);
        console.error("ML_USERS_ME_FETCH_ERROR", err);
        return res.redirect(`${appUrl}/integrations?mercadolivre=users_me_error`);
    }

    console.log("ML_USERS_ME_RESPONSE", {
      status: userRes.status,
      ok: userRes.ok
    });

    if (!userRes.ok) {
        return res.redirect(`${appUrl}/integrations?mercadolivre=users_me_error`);
    }

    const mlUser = await userRes.json();

    console.log("ML_SAVE_START");
    const db = await getAdminDb();

    // Check if we passed userId back from the cookie
    const cookieDataStr = req.headers.cookie?.split('; ').find(row => row.startsWith('ml_oauth_state='))?.split('=')[1];
    let userId: string | null = null;
    if (cookieDataStr) {
        try {
            const cookieData = JSON.parse(decodeURIComponent(cookieDataStr));
            userId = cookieData.userId;
        } catch (e) {}
    }

    try {
        const sellerId = mlUser.id?.toString() || tokenData.user_id?.toString() || tokenData.seller_id;
        const accountName = mlUser.first_name ? `${mlUser.first_name} ${mlUser.last_name || ''}`.trim() : mlUser.nickname;
        const nickname = mlUser.nickname;
        const siteId = mlUser.site_id;
        
        const integrationData = removeUndefinedDeep({
          user_id: userId || 'unknown',
          platform: "mercadolivre",
          seller_id: String(sellerId),
          account_name: accountName || null,
          nickname: nickname || null,
          site_id: siteId || null,
          access_token: tokenData.access_token || null,
          refresh_token: tokenData.refresh_token || null,
          expires_in: tokenData.expires_in || null,
          token_expires_at: tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
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
        return res.redirect(`${appUrl}/integrations?mercadolivre=save_error`);
    }

    console.log("ML_CALLBACK_SUCCESS_REDIRECT", {
      redirectTo: `${appUrl}/integrations?mercadolivre=connected`
    });

    return res.redirect(`${appUrl}/integrations?mercadolivre=connected`);
  } catch (error: any) {
    console.error("ML_CALLBACK_EXCEPTION", {
      message: error.message,
      stack: error.stack
    });
    return res.redirect(`${appUrl}/integrations?mercadolivre=callback_exception`);
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
