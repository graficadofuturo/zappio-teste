import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cookie from 'cookie';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const APP_BASE_URL = process.env.APP_BASE_URL || 'https://zappio-teste.vercel.app';
    const integrationsPath = "/dashboard/integrations";
    
    try {
      console.log("[ML OAuth Vercel Callback] Query Params:", req.query);
      const { code, state, error, error_description } = req.query;

      console.log("ML_CALLBACK_START", {
        hasCode: Boolean(code),
        hasState: Boolean(state),
        hasClientId: Boolean(process.env.ML_CLIENT_ID),
        hasClientSecret: Boolean(process.env.ML_CLIENT_SECRET),
        redirectUri: process.env.ML_REDIRECT_URI,
        appBaseUrl: process.env.APP_BASE_URL
      });

      if (error || error_description) {
         res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=error`);
         return;
      }

      if (!code) {
         res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=missing_code`);
         return;
      }

      const cookies = cookie.parse(req.headers.cookie || '');
      const stateCookieStr = cookies.ml_oauth_state;

      let validState = false;
      let userId: string | null = null;
      let cookieData: any = {};

      if (stateCookieStr) {
          try {
              cookieData = JSON.parse(decodeURIComponent(stateCookieStr));
              if (cookieData.state === state) {
                  validState = true;
                  userId = cookieData.userId;
              }
          } catch (e) {
              console.warn("Error parsing state cookie:", e);
          }
      }

      if (!validState) {
         console.log("Invalid state, continuing in debug mode");
      }

      const redirectUri = process.env.ML_REDIRECT_URI || "https://zappio-teste.vercel.app/api/integrations/mercadolivre/callback";
      const clientId = process.env.ML_CLIENT_ID || "";
      const clientSecret = process.env.ML_CLIENT_SECRET || "";

      if (!clientId || !clientSecret) {
          console.error("ML credentials not configured");
          res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=config_error`);
          return;
      }

      // 1. Fetch token
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
          const tokenErrorBody = await tokenRes.text();
          console.log("ML_TOKEN_RESPONSE", {
            status: tokenRes.status,
            ok: tokenRes.ok,
            body: tokenErrorBody
          });
          console.error("Failed to exchange code. Status:", tokenRes.status, "Body:", tokenErrorBody);
          res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=token_error`);
          return;
      }

      const tokenData: any = await tokenRes.json();
      
      console.log("ML_TOKEN_RESPONSE", {
        status: tokenRes.status,
        ok: tokenRes.ok,
        body: null
      });

      // 2. Fetch user
      let mlUser = {} as any;
      try {
          const userRes = await fetch('https://api.mercadolibre.com/users/me', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` }
          });
          
          console.log("ML_USERS_ME_RESPONSE", {
            status: userRes.status,
            ok: userRes.ok
          });
          
          if (userRes.ok) {
              mlUser = await userRes.json();
          } else {
              res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=user_error`);
              return;
          }
      } catch (err) {
          console.warn("[ML OAuth] Error fetching user:", err);
          res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=user_error`);
          return;
      }

      // 3. Save integration
      console.log("ML_SAVE_START");
      
      const hasFirebaseServiceAccountKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      console.log({ hasFirebaseServiceAccountKey });

      if (!admin.apps.length) {
          if (!hasFirebaseServiceAccountKey) {
              console.error("ML_FIREBASE_ADMIN_INIT_ERROR: Firebase Admin not initialized and FIREBASE_SERVICE_ACCOUNT_KEY not set");
              res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
              return;
          }

          let serviceAccount: any = null;
          try {
              serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
          } catch (error: any) {
              console.error("ML_FIREBASE_SERVICE_ACCOUNT_PARSE_ERROR", error.message);
              res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
              return;
          }

          try {
              if (serviceAccount.private_key) {
                  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
              }
              admin.initializeApp({
                  credential: admin.credential.cert(serviceAccount)
              });
          } catch (error: any) {
              console.error("ML_FIREBASE_ADMIN_INIT_ERROR", error.message);
              res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
              return;
          }
      }

      const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
      let parsedProjectId = "unknown";
      try {
          if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
              const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
              if (sa && sa.project_id) parsedProjectId = sa.project_id;
          }
      } catch (e) {}

      console.log("FIRESTORE_TARGET", {
        projectId: parsedProjectId,
        databaseId
      });

      const { getFirestore } = await import("firebase-admin/firestore");
      let db;
      try {
          db = getFirestore(admin.app(), databaseId);
      } catch (e) {
          db = admin.firestore();
          try {
              db.settings({ databaseId });
          } catch (err) {}
      }
      
      try {
          try {
              db.settings({ ignoreUndefinedProperties: true });
          } catch (e) {}

          const sellerId = mlUser.id?.toString() || tokenData.user_id?.toString() || tokenData.seller_id;
          const accountName = mlUser.first_name ? `${mlUser.first_name} ${mlUser.last_name || ''}`.trim() : mlUser.nickname;
          const nickname = mlUser.nickname;
          const siteId = mlUser.site_id;
          const accessToken = tokenData.access_token;
          const refreshToken = tokenData.refresh_token;
          const expiresIn = tokenData.expires_in;

          function removeUndefinedDeep(obj: any): any {
            if (Array.isArray(obj)) {
              return obj.map(removeUndefinedDeep).filter((v) => v !== undefined);
            }
            if (obj && typeof obj === "object") {
              return Object.fromEntries(
                Object.entries(obj)
                  .filter(([_, value]) => value !== undefined)
                  .map(([key, value]) => [key, removeUndefinedDeep(value)])
              );
            }
            return obj;
          }

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

          console.log("ML_SAVE_DATA_VALIDATION", {
            hasSellerId: Boolean(sellerId),
            hasAccessToken: Boolean(accessToken),
            hasRefreshToken: Boolean(refreshToken),
            keys: Object.keys(integrationData),
          });

          await db
            .collection("ecommerce_keys")
            .doc(String(sellerId))
            .set(integrationData, { merge: true });
            
      } catch (saveErr: any) {
          console.error("ML_FIRESTORE_SAVE_ERROR", {
              message: saveErr?.message,
              code: saveErr?.code,
              stack: saveErr?.stack,
          });

          if (saveErr?.code === 5 || (saveErr?.message && saveErr.message.includes('NOT_FOUND'))) {
              res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=firestore_not_found`);
              return;
          }

          res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
          return;
      }

      console.log("ML_SAVE_SUCCESS");
      console.log("[ML OAuth Vercel Callback] Success");
      res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=connected`);
    } catch (e: any) {
      console.error("ML_CALLBACK_EXCEPTION", {
        message: e?.message,
        name: e?.name,
        stack: e?.stack,
      });
      res.redirect(302, `${APP_BASE_URL}${integrationsPath}?mercadolivre=callback_exception`);
    }
}
