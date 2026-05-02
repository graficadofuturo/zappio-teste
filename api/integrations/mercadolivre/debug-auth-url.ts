import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;

  const missing = {
    clientId: !clientId,
    redirectUri: !redirectUri,
  };

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      ok: false,
      error: "missing_config",
      missing,
    });
  }

  const state = "debug-state";

  const authorizationUrl =
    "https://auth.mercadolivre.com.br/authorization" +
    "?response_type=code" +
    "&client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&state=" + encodeURIComponent(state);

  return res.status(200).json({
    ok: true,
    redirectUri,
    authorizationUrl,
    expectedRedirectUri: "https://zappio-teste.vercel.app/api/integrations/mercadolivre/callback",
    containsVercelDomain: authorizationUrl.includes("zappio-teste.vercel.app"),
    containsOldRunAppDomain: authorizationUrl.includes("ais-pre-jgg5kfa6ozln2cfdkicjmx-62492944237.us-west2.run.app"),
  });
}
