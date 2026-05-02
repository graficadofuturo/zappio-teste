import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cookie from 'cookie';
import { exchangeCodeForToken } from '../../../src/lib/mercadolivre/mlService';

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

      await exchangeMLCode(code as string, userId, redirectUri);
      
      console.log("[ML OAuth Vercel Callback] Success");
      res.redirect(302, `${APP_BASE_URL}/dashboard/integrations?mercadolivre=connected`);
    } catch (e: any) {
      console.error("[ML OAuth Vercel Callback] Exception:", e);
      const reason = encodeURIComponent(e.message || 'unknown error');
      res.redirect(302, `${APP_BASE_URL}/dashboard/integrations?mercadolivre=token_error&reason=${reason}`);
    }
}
