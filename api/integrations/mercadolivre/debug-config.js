export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  return res.status(200).json({
    ok: true,
    hasClientId: !!process.env.ML_CLIENT_ID,
    hasClientSecret: !!process.env.ML_CLIENT_SECRET,
    redirectUri: process.env.ML_REDIRECT_URI || null,
    appBaseUrl: process.env.APP_BASE_URL || null
  });
}
