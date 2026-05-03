import { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  console.log("ML_AUTH_URL_START");

  const ML_CLIENT_ID = process.env.ML_CLIENT_ID;
  const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI;
  const APP_BASE_URL = process.env.APP_BASE_URL || process.env.APP_URL || `https://${req.headers.host}`;

  console.log("ML_AUTH_URL_ENV_CHECK", {
    hasClientId: !!ML_CLIENT_ID,
    hasRedirectUri: !!ML_REDIRECT_URI,
    appBaseUrl: APP_BASE_URL,
  });

  const missing = [];
  if (!ML_CLIENT_ID) missing.push("ML_CLIENT_ID");
  if (!ML_REDIRECT_URI) missing.push("ML_REDIRECT_URI");

  if (missing.length > 0) {
    console.error("ML_AUTH_URL_ERROR", "Missing environment variables", missing);
    return res.status(500).json({
      ok: false,
      error: "missing_env",
      missing,
    });
  }

  try {
    const state = crypto.randomUUID();

    const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", ML_CLIENT_ID!);
    authorizationUrl.searchParams.set("redirect_uri", ML_REDIRECT_URI!);
    authorizationUrl.searchParams.set("state", state);

    console.log("ML_AUTH_URL_CREATED", { state });

    return res.status(200).json({
      ok: true,
      authorizationUrl: authorizationUrl.toString(),
      redirectUri: ML_REDIRECT_URI,
      state: state
    });
  } catch (error: any) {
    console.error("ML_AUTH_URL_ERROR", error.message);
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: error.message,
    });
  }
}
