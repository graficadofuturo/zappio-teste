import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin.ts";

const router = Router();

router.get("/connected-marketplaces", async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'User ID is required' });
  }

  try {
    const db = await getAdminDb();
    const marketplaces = [];

    // Check ecommerce_keys for integrations
    const keysSnapshot = await db.collection("ecommerce_keys")
      .where("user_id", "==", userId)
      .get();

    const platforms = new Set<string>();
    keysSnapshot.forEach(doc => {
      const data = doc.data();
      const st = data.status || data.conected || data.connected;
      if (st === 'connected' || st === 'active' || st === true) {
         platforms.add(data.platform);
      }
    });

    // Check ML OAuth integration
    const mlDocSnap = await db.doc(`users/${userId}/integrations/mercadolivre`).get();
    if (mlDocSnap.exists) {
      const mlData = mlDocSnap.data();
      if (mlData && mlData.connected === true) {
        platforms.add('mercadolivre');
      }
    }

    if (platforms.has('mercadolivre') || platforms.has('mercado_livre') || platforms.has('mercadolivre_manual')) {
      marketplaces.push({
        id: "mercadolivre",
        name: "Mercado Livre (Minha Conta)",
        connected: true,
        status: "connected"
      });
    }

    // ALWAYS include Global Bank
    marketplaces.push({
      id: "mercadolivre_global",
      name: "Mercado Livre (Banco Global)",
      connected: true,
      status: "connected",
      isGlobal: true
    });

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

    res.status(200).json({
      ok: true,
      marketplaces
    });
  } catch (error: any) {
    console.error("CONNECTED_MARKETPLACES_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
