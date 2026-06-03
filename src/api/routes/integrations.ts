import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin.js";

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

router.get("/aliexpress/cookie-config", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const { uid } = req.query;
    if (!uid || uid === "undefined") {
      return res.status(400).json({ ok: false, error: "MISSING_UID" });
    }

    const db = getAdminDb();
    const docSnap = await db.doc(`users/${uid}/integrations/aliexpress`).get();
    
    if (!docSnap.exists) {
      return res.status(200).json({ ok: true, config: null });
    }

    const data = docSnap.data() || {};
    const hasCookie = !!(data.cookie || data.aliexpressCookie);
    const cookieLength = hasCookie ? (data.cookie || data.aliexpressCookie).length : 0;

    res.json({
      ok: true,
      config: {
        hasCookie,
        cookieLength,
        affiliateTag: data.affiliateTag || '',
        affiliateCookieStatus: data.affiliateCookieStatus || (hasCookie ? 'valid' : 'missing'),
        updatedAt: data.updatedAt || null
      }
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/aliexpress/cookie-config", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const { uid } = req.query;
    const { cookie, affiliateTag } = req.body;
    
    if (!uid || uid === "undefined") {
      return res.status(400).json({ ok: false, error: "MISSING_UID" });
    }

    const db = getAdminDb();
    const docRef = db.doc(`users/${uid}/integrations/aliexpress`);
    
    const updateData: any = {
      connected: true,
      status: 'CONECTADO',
      marketplace: "aliexpress",
      updatedAt: new Date().toISOString()
    };

    if (cookie !== undefined) {
      updateData.cookie = cookie;
      updateData.aliexpressCookie = cookie;
      updateData.affiliateCookieStatus = 'valid';
    }
    
    if (affiliateTag !== undefined) {
      updateData.affiliateTag = affiliateTag;
    }

    await docRef.set(updateData, { merge: true });

    // Also sync/create a document in 'ecommerce_keys' to make it show up in connected-marketplaces!
    const keysCol = db.collection("ecommerce_keys");
    const keyQuery = await keysCol
      .where("user_id", "==", uid)
      .where("platform", "==", "aliexpress")
      .get();
      
    const keyData = {
      user_id: uid,
      platform: "aliexpress",
      status: "connected",
      updated_at: new Date()
    };
    
    if (keyQuery.empty) {
      await keysCol.add(keyData);
    } else {
      await keysCol.doc(keyQuery.docs[0].id).set(keyData, { merge: true });
    }

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/aliexpress/disconnect", async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const { uid } = req.query;
    if (!uid || uid === "undefined") {
      return res.status(400).json({ ok: false, error: "MISSING_UID" });
    }

    const db = getAdminDb();
    
    // Deactivate in integrations/aliexpress
    await db.doc(`users/${uid}/integrations/aliexpress`).set({
      connected: false,
      status: 'DESCONECTADO',
      cookie: null,
      aliexpressCookie: null,
      affiliateCookieStatus: 'disconnected',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Remove or set inactive in ecommerce_keys
    const keysCol = db.collection("ecommerce_keys");
    const keyQuery = await keysCol
      .where("user_id", "==", uid)
      .where("platform", "==", "aliexpress")
      .get();
      
    if (!keyQuery.empty) {
      await keysCol.doc(keyQuery.docs[0].id).set({
        status: "disconnected",
        updated_at: new Date()
      }, { merge: true });
    }

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
