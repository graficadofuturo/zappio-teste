import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
      hasClientId: !!process.env.ML_CLIENT_ID,
      hasClientSecret: !!process.env.ML_CLIENT_SECRET,
      redirectUri: process.env.ML_REDIRECT_URI,
      appBaseUrl: process.env.APP_BASE_URL,
      webhookUrl: process.env.ML_WEBHOOK_URL
  });
}
