import { recordProductSent } from './helpers';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { campaignId, productId, userId } = req.body;

  try {
    await recordProductSent(campaignId, productId, userId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error marking product as sent:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
