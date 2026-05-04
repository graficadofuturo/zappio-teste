import { getAdminDb } from "../../_lib/firebase-admin.js";

export default async function handler(req, res) {
  const APP_BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://zappio-teste.vercel.app";

  console.log("ML_CALLBACK_FILE", "api/integrations/mercadolivre/callback.js");

  try {
    const url = new URL(req.url, APP_BASE_URL);
    const code = url.searchParams.get("code") || req.query.code;
    const state = url.searchParams.get("state") || req.query.state;

    console.log("ML_CALLBACK_START", { hasCode: Boolean(code), hasState: Boolean(state) });

    if (!code) {
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=error&reason=missing_code`);
    }

    const clientId = process.env.ML_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET;
    const redirectUri = process.env.ML_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("ML_CALLBACK_ERROR_FULL", { step: "env", message: "Missing required ML env vars" });
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=error&reason=missing_ml_env`);
    }

    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code: String(code),
      redirect_uri: redirectUri,
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
        const errorText = await tokenRes.text();
        console.error("ML_CALLBACK_ERROR_FULL", { step: "token_fetch", message: errorText, status: tokenRes.status });
        return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error&reason=token_error`);
    }

    const token = await tokenRes.json();
    console.log("ML_TOKEN_OK", { hasAccessToken: Boolean(token?.access_token), expiresIn: token?.expires_in || null });

    const userRes = await fetch("https://api.mercadolibre.com/users/me", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token.access_token}`
      }
    });

    if (!userRes.ok) {
        const errorText = await userRes.text();
        console.error("ML_CALLBACK_ERROR_FULL", { step: "users_me_fetch", message: errorText, status: userRes.status });
        return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error&reason=user_error`);
    }

    const user = await userRes.json();
    console.log("ML_USER_OK", { mlUserId: user?.id || null, nickname: user?.nickname || null });

    const rawPayload = {
      marketplace: "mercadolivre",
      provider: "mercadolivre",
      connected: true,
      status: "connected",

      mlUserId: user?.id ? String(user.id) : null,
      nickname: user?.nickname || null,
      email: user?.email || null,
      firstName: user?.first_name || null,
      lastName: user?.last_name || null,
      countryId: user?.country_id || null,

      accessToken: token?.access_token || null,
      refreshToken: token?.refresh_token || null,
      tokenType: token?.token_type || null,
      expiresIn: token?.expires_in || null,
      scope: token?.scope || null,

      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const payload = Object.fromEntries(
      Object.entries(rawPayload).filter(([_, value]) => value !== undefined)
    );

    const db = getAdminDb();
    const docPath = "marketplace_integrations/mercadolivre";
    const docRef = db.doc(docPath);

    console.log("ML_CALLBACK_SAVE_PATH", docPath);
    console.log("ML_CALLBACK_SAVE_PAYLOAD_KEYS", Object.keys(payload));

    try {
      await docRef.set(payload);
      console.log("ML_CALLBACK_SAVE_OK", true);
    } catch (saveError) {
      console.error("ML_CALLBACK_ERROR_FULL", {
        step: "firestore_save",
        message: saveError?.message,
        code: saveError?.code,
        stack: saveError?.stack
      });
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error&reason=save_exception`);
    }

    try {
      const verifySnap = await docRef.get();
      console.log("ML_CALLBACK_VERIFY_EXISTS", verifySnap.exists);

      if (verifySnap.exists && verifySnap.data()?.connected === true) {
         return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=connected`);
      } else {
         return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error&reason=verify_failed`);
      }
    } catch (verifyError) {
       console.error("ML_CALLBACK_ERROR_FULL", {
        step: "firestore_verify",
        message: verifyError?.message,
        code: verifyError?.code,
        stack: verifyError?.stack
      });
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error&reason=verify_exception`);
    }

  } catch (error) {
    console.error("ML_CALLBACK_ERROR_FULL", {
      step: "callback_handler",
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error&reason=callback_exception`);
  }
}
