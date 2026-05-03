import crypto from "crypto";

export default async function handler(req, res) {
  try {
    console.log("ML_AUTH_URL_START", {
      method: req.method,
      hasClientId: !!process.env.ML_CLIENT_ID,
      hasClientSecret: !!process.env.ML_CLIENT_SECRET,
      redirectUri: process.env.ML_REDIRECT_URI,
      appBaseUrl: process.env.APP_BASE_URL
    });

    res.setHeader("Content-Type", "application/json");

    if (req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        error: "method_not_allowed",
        message: "Método não permitido."
      });
    }

    const clientId = process.env.ML_CLIENT_ID;
    const redirectUri = process.env.ML_REDIRECT_URI;

    if (!clientId) {
      return res.status(500).json({
        ok: false,
        error: "missing_ml_client_id",
        message: "ML_CLIENT_ID não configurado."
      });
    }

    if (!redirectUri) {
      return res.status(500).json({
        ok: false,
        error: "missing_ml_redirect_uri",
        message: "ML_REDIRECT_URI não configurado."
      });
    }

    const state = crypto.randomUUID();

    const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", state);

    console.log("ML_AUTH_URL_CREATED", {
      authorizationUrl: authorizationUrl.toString()
    });

    return res.status(200).json({
      ok: true,
      authorizationUrl: authorizationUrl.toString(),
      redirectUri,
      hasClientId: true,
      hasRedirectUri: true
    });

  } catch (error) {
    console.error("ML_AUTH_URL_EXCEPTION", {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      ok: false,
      error: "auth_url_exception",
      message: error.message || "Erro ao gerar URL de autenticação."
    });
  }
}
