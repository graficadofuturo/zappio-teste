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

    const { uid } = req.query;

    if (!clientId || !redirectUri) {
      const stateObj = { uid: String(uid || 'default_user'), nonce: randomUUID(), createdAt: Date.now() };
      const stateStr = JSON.stringify(stateObj);
      const encodedState = encodeURIComponent(Buffer.from(stateStr).toString('base64url'));
      
      const mockAuthUrl = `${appBaseUrl}/api/integrations/mercadolivre/callback?code=mock_code&state=${encodedState}`;
      
      return res.status(200).json({
        ok: true,
        authorizationUrl: mockAuthUrl
      });
    }

    const state = randomUUID();

    const authorizationUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return res.status(200).json({
      ok: true,
      authorizationUrl,
      redirectUri,
      state
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
