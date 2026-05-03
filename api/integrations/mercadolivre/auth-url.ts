import { randomBytes } from "crypto";

export default async function handler(req, res) {
  const appUrl = process.env.APP_URL || process.env.APP_BASE_URL || `https://${req.headers.host}`;
  console.log("ML_AUTH_URL_START", {
     hasMlRedirectUri: !!process.env.ML_REDIRECT_URI,
     redirectUri: process.env.ML_REDIRECT_URI,
     appBaseUrl: appUrl,
     hasClientId: !!process.env.ML_CLIENT_ID,
     hasClientSecret: !!process.env.ML_CLIENT_SECRET
  });
  
  // Set headers for JSON response
  res.setHeader('Content-Type', 'application/json');

  try {
    const clientId = process.env.ML_CLIENT_ID;
    const redirectUri = process.env.ML_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      const missing = [];
      if (!clientId) missing.push("ML_CLIENT_ID");
      if (!redirectUri) missing.push("ML_REDIRECT_URI");
      
      console.error("ML_AUTH_URL_ERROR", "Missing environment variables", missing);
      return res.status(200).json({
        ok: false,
        error: "missing_ml_redirect_uri",
        message: "A variável ML_REDIRECT_URI não está configurada no ambiente.",
        missing
      });
    }

    const state = randomBytes(16).toString("hex");

    const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", state);

    console.log("ML_AUTH_URL_CREATED", {
      authorizationUrl: authorizationUrl.toString()
    });

    const { userId } = req.query;
    // Vercel handles cookies differently, but this is standard Express-like
    res.setHeader('Set-Cookie', `ml_oauth_state=${JSON.stringify({ state, userId: userId ? String(userId) : "unknown" })}; Path=/; HttpOnly; Max-Age=600; SameSite=Lax; Secure`);

    return res.status(200).json({
      ok: true,
      authorizationUrl: authorizationUrl.toString()
    });
  } catch (error) {
    console.error("ML_AUTH_URL_ERROR", error.message);
    return res.status(500).json({
      ok: false,
      error: "auth_url_exception",
      message: error.message || "Erro ao gerar URL de conexão."
    });
  }
}
