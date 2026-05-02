import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'crypto';
import * as cookie from 'cookie';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { userId } = req.query;
  const state = randomBytes(16).toString('hex');
  
  const stateCookie = cookie.serialize('ml_oauth_state', JSON.stringify({ state, userId: userId ? String(userId) : "" }), {
    httpOnly: true,
    maxAge: 1000 * 60 * 10,
    sameSite: 'lax',
    secure: true,
    path: '/'
  });

  res.setHeader('Set-Cookie', stateCookie);

  const redirectUri = process.env.ML_REDIRECT_URI || "";
  const clientId = process.env.ML_CLIENT_ID || "";
  
  const authorizationUrl =
        "https://auth.mercadolivre.com.br/authorization" +
        "?response_type=code" +
        "&client_id=" + clientId +
        "&redirect_uri=" + encodeURIComponent(redirectUri) +
        "&state=" + state;

  res.redirect(302, authorizationUrl);
}
