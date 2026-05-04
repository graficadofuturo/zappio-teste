export default async function handler(req, res) {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    return res.status(200).json({
      ok: true,
      route: "/api/integrations/mercadolivre/debug-auth-url",
      message: "debug route working",
      env: {
        hasMlClientId: Boolean(process.env.ML_CLIENT_ID),
        hasMlRedirectUri: Boolean(process.env.ML_REDIRECT_URI),
        hasAppBaseUrl: Boolean(process.env.APP_BASE_URL),
        hasFirestoreDatabaseId: Boolean(process.env.FIRESTORE_DATABASE_ID),
        hasFirebaseServiceAccountKey: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      }
    });
  } catch (error) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    return res.status(500).json({
      ok: false,
      route: "/api/integrations/mercadolivre/debug-auth-url",
      error: error?.message || String(error)
    });
  }
}
