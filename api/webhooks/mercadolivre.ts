import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).send("Mercado Livre webhook ativo");
  } else if (req.method === 'POST') {
    console.log("[ML Webhook Vercel] Received body:", req.body);
    return res.status(200).send("OK");
  }
  
  return res.status(405).send("Method Not Allowed");
}
