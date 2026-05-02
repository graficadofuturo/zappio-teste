import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cookie from 'cookie';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const APP_BASE_URL = process.env.APP_BASE_URL;
    try {
      console.log("[ML OAuth Vercel Callback] Query Params:", req.query);
      const { code, state, error, error_description } = req.query;

      if (error || error_description) {
         res.redirect(302, `${APP_BASE_URL}/dashboard/integrations?mercadolivre=error`);
         return;
      }

      if (!code) {
         res.redirect(302, `${APP_BASE_URL}/dashboard/integrations?mercadolivre=missing_code`);
         return;
      }

      const cookies = cookie.parse(req.headers.cookie || '');
      const stateCookieStr = cookies.ml_oauth_state;

      if (!stateCookieStr) {
         res.redirect(302, `${APP_BASE_URL}/dashboard/integrations?mercadolivre=invalid_state`);
         return;
      }

      const cookieData = JSON.parse(decodeURIComponent(stateCookieStr));
      if (cookieData.state !== state) {
         res.redirect(302, `${APP_BASE_URL}/dashboard/integrations?mercadolivre=invalid_state`);
         return;
      }

      const userId = cookieData.userId;
      const redirectUri = process.env.ML_REDIRECT_URI || "";
      const clientId = process.env.ML_CLIENT_ID || "";
      const clientSecret = process.env.ML_CLIENT_SECRET || "";

      if (!clientId || !clientSecret) {
          throw new Error("ML credentials not configured");
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
          throw new Error(`Failed to exchange code: ${await tokenRes.text()}`);
      }

      const tokenData: any = await tokenRes.json();

      // 2. Fetch user
      let mlUser = {} as any;
      try {
          const userRes = await fetch('https://api.mercadolibre.com/users/me', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` }
          });
          if (userRes.ok) {
              mlUser = await userRes.json();
          }
      } catch (err) {
          console.warn("[ML OAuth] Error fetching user:", err);
      }

      // 3. Save integration
      if (!admin.apps.length) {
          if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
              const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
              admin.initializeApp({
                  credential: admin.credential.cert(serviceAccount)
              });
          } else {
              throw new Error("Firebase Admin not initialized and FIREBASE_SERVICE_ACCOUNT_KEY not set");
          }
      }

      const db = getFirestore();
      
      let existingDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      let qs = await db.collection('ecommerce_keys')
          .where('user_id', '==', userId)
          .where('platform', '==', 'mercadolivre')
          .limit(1)
          .get();

      if (!qs.empty) {
          existingDoc = qs.docs[0];
      } else {
          qs = await db.collection('ecommerce_keys')
              .where('user_id', '==', userId)
              .where('platform', '==', 'mercado_livre')
              .limit(1)
              .get();
          if (!qs.empty) existingDoc = qs.docs[0];
      }

      const token_expires_at = tokenData.expires_in ? new Date(Date.now() + (tokenData.expires_in * 1000)) : admin.firestore.FieldValue.serverTimestamp();

      const payload: any = {
          user_id: userId,
          platform: 'mercadolivre',
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          seller_id: mlUser.id?.toString() || tokenData.user_id?.toString() || tokenData.seller_id,
          account_name: mlUser.nickname || '',
          site_id: mlUser.site_id || '',
          permalink: mlUser.permalink || '',
          expires_in: tokenData.expires_in,
          token_expires_at: token_expires_at,
          scope: tokenData.scope,
          status: 'connected',
          connected_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
      };

      if (existingDoc) {
          await existingDoc.ref.update(payload);
      } else {
          await db.collection('ecommerce_keys').add(payload);
      }

      console.log("[ML OAuth Vercel Callback] Success");
      res.redirect(302, `${APP_BASE_URL}/dashboard/integrations?mercadolivre=connected`);
    } catch (e: any) {
      console.error("[ML OAuth Vercel Callback] Exception:", e);
      const reason = encodeURIComponent(e.message || 'unknown error');
      res.redirect(302, `${APP_BASE_URL}/dashboard/integrations?mercadolivre=token_error&reason=${reason}`);
    }
}
