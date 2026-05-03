import { getAdminDb, removeUndefinedDeep } from "../../../src/api/firebaseAdmin";

export default async function handler(req, res) {
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  
  const appUrl = process.env.APP_URL || process.env.APP_BASE_URL || `https://${req.headers.host}`;
  const redirectUri = process.env.ML_REDIRECT_URI || "";

  console.log("ML_CALLBACK_START", {
    hasCode: !!code,
    hasState: !!state,
    hasMlRedirectUri: !!process.env.ML_REDIRECT_URI,
    redirectUri,
    appBaseUrl: appUrl,
    hasClientId: !!process.env.ML_CLIENT_ID,
    hasClientSecret: !!process.env.ML_CLIENT_SECRET
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

    if (!clientId || !clientSecret || !redirectUri) {
        console.error("ML credentials or redirect URI not configured", {
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
            hasRedirectUri: !!redirectUri
        });
        return res.redirect(`${appUrl}/integrations?mercadolivre=config_error`);
    }

    let tokenRes;
    try {
      tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded', 
            'Accept': 'application/json' 
          },
          body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: clientId,
              client_secret: clientSecret,
              code: String(code),
              redirect_uri: redirectUri
          }).toString()
      });
    } catch (e) {
      console.error("ML_TOKEN_FETCH_ERROR", e);
      return res.redirect(`${appUrl}/integrations?mercadolivre=token_error`);
    }

    if (!tokenRes.ok) {
        const errorData = await tokenRes.json().catch(() => ({}));
        console.error("ML_TOKEN_ERROR_RESPONSE", errorData);
        return res.redirect(`${appUrl}/integrations?mercadolivre=token_error`);
    }

    const tokenData = await tokenRes.json();

    let userRes;
    try {
        userRes = await fetch('https://api.mercadolibre.com/users/me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
    } catch (err) {
        console.error("ML_USERS_ME_FETCH_ERROR", err);
        return res.redirect(`${appUrl}/integrations?mercadolivre=users_me_error`);
    }

    if (!userRes.ok) {
        return res.redirect(`${appUrl}/integrations?mercadolivre=users_me_error`);
    }

    const mlUser = await userRes.json();

    console.log("ML_SAVE_START");
    const db = await getAdminDb();

    // Try to get userId from the cookie
    const cookies = req.headers.cookie || '';
    const cookieDataStr = cookies.split('; ').find(row => row.startsWith('ml_oauth_state='))?.split('=')[1];
    let userId = 'unknown';
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
          user_id: userId,
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
          
    } catch (saveErr) {
        console.error("ML_FIRESTORE_SAVE_ERROR", saveErr);
        return res.redirect(`${appUrl}/integrations?mercadolivre=save_error`);
    }

    return res.redirect(`${appUrl}/integrations?mercadolivre=connected`);
  } catch (error) {
    console.error("ML_CALLBACK_EXCEPTION", error);
    return res.redirect(`${appUrl}/integrations?mercadolivre=callback_exception`);
  }
}
