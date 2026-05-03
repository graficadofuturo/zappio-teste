import { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;
  const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://zappio-teste.vercel.app";

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      ok: false,
      error: "Missing Mercado Livre OAuth environment variables",
      hasClientId: !!clientId,
      hasRedirectUri: !!redirectUri
    });
  }

  const userId = req.query.userId || "unknown";
  
  const statePayload = {
    uuid: crypto.randomUUID(),
    userId: String(userId)
  };
  const state = encodeURIComponent(JSON.stringify(statePayload));

  const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);

  return res.status(200).json({
    ok: true,
    authorizationUrl: authorizationUrl.toString(),
    redirectUri: redirectUri,
    state: state
  });
}
