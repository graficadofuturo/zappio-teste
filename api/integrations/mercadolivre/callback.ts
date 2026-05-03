import { VercelRequest, VercelResponse } from "@vercel/node";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getFirebaseDb() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  const apps = getApps();
  const app = apps.length
    ? apps[0]
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });

  return getFirestore(app, process.env.FIRESTORE_DATABASE_ID || "(default)");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const APP_BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://zappio-teste.vercel.app";

  try {
    const url = new URL(req.url || "", APP_BASE_URL);
    const code = url.searchParams.get("code") || req.query.code;
    const state = url.searchParams.get("state") || req.query.state;

    if (!code) return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=missing_code`);
    if (!state) return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=missing_state`);

    const clientId = process.env.ML_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET;
    const redirectUri = process.env.ML_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=callback_exception`);
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

    if (!tokenRes.ok) return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=token_error`);

    const tokenData: any = await tokenRes.json();

    const userRes = await fetch("https://api.mercadolibre.com/users/me", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${tokenData.access_token}`
      }
    });

    if (!userRes.ok) return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=user_error`);

    const mlUser: any = await userRes.json();

    const db = getFirebaseDb();

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

    const sellerId = String(mlUser.id || tokenData.user_id || "");

    const data = {
      marketplace: "mercadolivre",
      connected: true,
      status: "connected",
      mlUserId: String(mlUser.id),
      nickname: mlUser.nickname,
      email: mlUser.email || null,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresIn: tokenData.expires_in || null,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      user_id: userId,
      platform: "mercadolivre",
      seller_id: sellerId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
    };

    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    try {
      if (userId && userId !== "unknown") {
        await db.collection("users").doc(userId).collection("integrations").doc("mercadolivre").set(cleanData, { merge: true });
      }
      // Also save to ecommerce_keys for backward compatibility
      await db.collection("ecommerce_keys").doc(sellerId).set(cleanData, { merge: true });
    } catch (dbErr) {
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error`);
    }

    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=connected`);
  } catch (error: any) {
    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=callback_exception`);
  }
}
