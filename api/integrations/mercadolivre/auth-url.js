import { randomUUID } from "crypto";

export default async function handler(req, res) {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed"
      });
    }

    const clientId = process.env.ML_CLIENT_ID;
    const redirectUri = process.env.ML_REDIRECT_URI;
    const appBaseUrl = process.env.APP_BASE_URL || "https://zappio-teste.vercel.app";

    if (!clientId || !redirectUri) {
      const missing = [];
      if (!clientId) missing.push("ML_CLIENT_ID");
      if (!redirectUri) missing.push("ML_REDIRECT_URI");
      
      return res.status(500).json({
        ok: false,
        error: "Missing required environment variables",
        missing: missing
      });
    }

    const state = typeof randomUUID === 'function' ? randomUUID() : `ml-${Date.now()}-${Math.random()}`;

    const authorizationUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return res.status(200).json({
      ok: true,
      authorizationUrl: authorizationUrl,
      redirectUri: redirectUri,
      state: state
    });

  } catch (error) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    return res.status(500).json({
      ok: false,
      route: "/api/integrations/mercadolivre/auth-url",
      error: error?.message || String(error)
    });
  }
}
