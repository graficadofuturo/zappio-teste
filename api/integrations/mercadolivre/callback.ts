import { VercelRequest, VercelResponse } from "@vercel/node";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const APP_BASE_URL = process.env.APP_BASE_URL || process.env.APP_URL || `https://${req.headers.host}`;
  
  if (req.method !== "GET") {
    console.error("ML_CALLBACK_ERROR", "Method not GET");
    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=callback_exception`);
  }

  console.log("ML_CALLBACK_START");

  const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
  const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
  const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI;
  const FIREBASE_SERVICE_ACCOUNT_KEY = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID;

  try {
    const url = new URL(req.url || "", APP_BASE_URL);
    const code = url.searchParams.get("code") || req.query.code;
    const state = url.searchParams.get("state") || req.query.state;

    console.log("ML_CALLBACK_PARAMS", { hasCode: !!code, hasState: !!state });

    if (!code) {
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=missing_code`);
    }

    if (!state) {
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=missing_state`);
    }

    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
      console.error("ML_CALLBACK_ERROR", "Missing ML credentials");
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=callback_exception`);
    }

    console.log("ML_TOKEN_REQUEST_START");
    
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
        "Accept": "application/json"
      },
      body: tokenParams.toString()
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("ML_CALLBACK_ERROR", "Token Error", errBody);
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=token_error`);
    }

    const tokenData = await tokenRes.json();
    console.log("ML_TOKEN_RESPONSE", { hasAccessToken: !!tokenData.access_token });

    console.log("ML_USERS_ME_REQUEST_START");
    const userRes = await fetch("https://api.mercadolibre.com/users/me", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${tokenData.access_token}`
      }
    });

    if (!userRes.ok) {
      const errBody = await userRes.text();
      console.error("ML_CALLBACK_ERROR", "Users Me Error", errBody);
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=user_error`);
    }

    const mlUser = await userRes.json();
    console.log("ML_USERS_ME_RESPONSE", { mlUserId: mlUser.id, nickname: mlUser.nickname });

    if (!FIREBASE_SERVICE_ACCOUNT_KEY || !FIRESTORE_DATABASE_ID) {
      console.error("ML_CALLBACK_ERROR", "Missing Firebase credentials");
      return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=save_error`);
    }

    console.log("ML_FIRESTORE_SAVE_START");
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_KEY);

    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });

    const db = getFirestore(app, FIRESTORE_DATABASE_ID || "(default)");

    // Save tokens and user info in Firestore
    const sellerId = String(mlUser.id || tokenData.user_id || "");
    const accountName = mlUser.first_name ? `${mlUser.first_name} ${mlUser.last_name || ''}`.trim() : mlUser.nickname;

    const data = {
      user_id: "unknown", 
      platform: "mercadolivre",
      seller_id: sellerId,
      ml_user_id: String(mlUser.id),
      account_name: accountName,
      nickname: mlUser.nickname,
      email: mlUser.email,
      site_id: mlUser.site_id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : undefined,
      status: "connected",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    await db.collection("ecommerce_keys").doc(sellerId).set(cleanData, { merge: true });

    console.log("ML_FIRESTORE_SAVE_SUCCESS", { sellerId });
    console.log("ML_CALLBACK_REDIRECT_CONNECTED");
    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=connected`);
  } catch (error: any) {
    console.error("ML_CALLBACK_ERROR", error);
    return res.redirect(`${APP_BASE_URL}/integrations?mercadolivre=callback_exception`);
  }
}
