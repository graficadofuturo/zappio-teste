import { getAdminDb } from "../../lib/firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'User ID is required' });
  }

  try {
    const db = getAdminDb();
    const marketplaces = [];

    // 1. Check ecommerce_keys for integrations (Shopee, etc)
    const keysSnapshot = await db.collection("ecommerce_keys")
      .where("user_id", "==", userId)
      .where("status", "==", "connected")
      .get();

    const platforms = new Set();
    keysSnapshot.forEach(doc => {
      const data = doc.data();
      platforms.add(data.platform);
    });

    // 2. Extra check for Mercado Livre specifically (as it might have complex status)
    // For now, if it's in ecommerce_keys with status connected, we count it.
    // We can add more specific logic if status needs external validation.
    
    if (platforms.has('mercadolivre') || platforms.has('mercado_livre')) {
      marketplaces.push({
        id: "mercadolivre",
        name: "Mercado Livre",
        connected: true,
        status: "connected"
      });
    }

    if (platforms.has('shopee')) {
      marketplaces.push({
        id: "shopee",
        name: "Shopee",
        connected: true,
        status: "connected"
      });
    }
    
    if (platforms.has('amazon')) {
      marketplaces.push({
        id: "amazon",
        name: "Amazon",
        connected: true,
        status: "connected"
      });
    }

    if (platforms.has('aliexpress')) {
      marketplaces.push({
        id: "aliexpress",
        name: "AliExpress",
        connected: true,
        status: "connected"
      });
    }

    return res.status(200).json({
      ok: true,
      marketplaces
    });

  } catch (error) {
    console.error("CONNECTED_MARKETPLACES_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
