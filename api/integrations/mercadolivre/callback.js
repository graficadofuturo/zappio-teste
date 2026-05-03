import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

export default async function handler(req, res) {
  let appBaseUrl = (process.env.APP_BASE_URL || "https://zappio-teste.vercel.app").replace(/\/$/, "");

  try {
    console.log("ML_CALLBACK_START", {
      method: req.method,
      hasCode: !!req.query?.code,
      hasState: !!req.query?.state,
      hasClientId: !!process.env.ML_CLIENT_ID,
      hasClientSecret: !!process.env.ML_CLIENT_SECRET,
      hasRedirectUri: !!process.env.ML_REDIRECT_URI,
      hasFirebaseServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
    });

    if (req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        error: "method_not_allowed"
      });
    }

    const code = req.query?.code;

    if (!code) {
      return res.redirect(
        `${appBaseUrl}/integrations?mercadolivre=missing_code`
      );
    }

    const clientId = process.env.ML_CLIENT_ID || "";
    const clientSecret = process.env.ML_CLIENT_SECRET || "";
    const redirectUri = process.env.ML_REDIRECT_URI || "";

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("ML_CALLBACK_MISSING_ENV", {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasRedirectUri: !!redirectUri
      });

      return res.redirect(
        `${appBaseUrl}/integrations?mercadolivre=missing_env`
      );
    }

    const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code),
        redirect_uri: redirectUri
      })
    });

    const tokenText = await tokenResponse.text();

    console.log("ML_TOKEN_RESPONSE", {
      status: tokenResponse.status,
      ok: tokenResponse.ok,
      bodyPreview: tokenText.slice(0, 300)
    });

    let tokenData = null;

    try {
      tokenData = JSON.parse(tokenText);
    } catch (jsonError) {
      console.error("ML_TOKEN_JSON_ERROR", tokenText);

      return res.redirect(
        `${appBaseUrl}/integrations?mercadolivre=token_json_error`
      );
    }

    if (!tokenResponse.ok || !tokenData?.access_token) {
      console.error("ML_TOKEN_ERROR", tokenData);

      return res.redirect(
        `${appBaseUrl}/integrations?mercadolivre=token_error`
      );
    }

    const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${tokenData.access_token}`,
        "Accept": "application/json"
      }
    });

    const userText = await userResponse.text();

    console.log("ML_USERS_ME_RESPONSE", {
      status: userResponse.status,
      ok: userResponse.ok,
      bodyPreview: userText.slice(0, 300)
    });

    let userData = null;

    try {
      userData = JSON.parse(userText);
    } catch (jsonError) {
      console.error("ML_USER_JSON_ERROR", userText);

      return res.redirect(
        `${appBaseUrl}/integrations?mercadolivre=user_json_error`
      );
    }

    if (!userResponse.ok || !userData?.id) {
      console.error("ML_USER_ERROR", userData);

      return res.redirect(
        `${appBaseUrl}/integrations?mercadolivre=user_error`
      );
    }

    console.log("ML_SAVE_START", {
      mlUserId: userData.id
    });

    const accountName = userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : userData.nickname;

    const integrationData = {
      provider: "mercadolivre",
      status: "connected",
      connected: true,
      ml_user_id: String(userData.id),
      seller_id: String(userData.id),
      account_name: accountName || null,
      nickname: userData.nickname || null,
      site_id: userData.site_id || null,
      email: userData.email || null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_in: tokenData.expires_in || null,
      token_expires_at: tokenData.expires_in
         ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
         : null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    Object.keys(integrationData).forEach((key) => {
      if (integrationData[key] === undefined) {
        delete integrationData[key];
      }
    });

    try {
      if (!admin.apps.length) {
        const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "";
        if (serviceAccountBase64.trim()) {
          const serviceAccount = JSON.parse(
            Buffer.from(serviceAccountBase64, 'base64').toString('ascii')
          );
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        } else {
          admin.initializeApp();
        }
      }
      
      let userId = "unknown";
      if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').map(c => c.trim());
        const mlUserIdCookie = cookies.find(c => c.startsWith('ml_oauth_userId='));
        if (mlUserIdCookie) {
          userId = mlUserIdCookie.split('=')[1];
        }
      }

      console.log("ML_SAVE_SUCCESS", {
        path: `users/${userId}/integrations/mercadolivre`,
        connected: true,
        mlUserId: userData.id
      });

      const db = getFirestore();
      
      // Save it explicitly to users/{uid}/integrations/mercadolivre
      if (userId && userId !== "unknown") {
        await db.collection("users").doc(userId).collection("integrations").doc("mercadolivre").set(integrationData, { merge: true });
      }

      // Also save to ecommerce_keys as fallback if needed elsewhere
      await db.collection("ecommerce_keys").doc(String(userData.id)).set(integrationData, { merge: true });
    } catch (dbError) {
      console.error("ML_FIRESTORE_SAVE_ERROR", dbError);
    }

    console.log("ML_CALLBACK_SUCCESS_REDIRECT");

    return res.redirect(
      `${appBaseUrl}/integrations?mercadolivre=connected`
    );
  } catch (error) {
    console.error("ML_CALLBACK_EXCEPTION", {
      message: error?.message,
      stack: error?.stack
    });

    return res.redirect(
      `${appBaseUrl}/integrations?mercadolivre=callback_exception`
    );
  }
}
