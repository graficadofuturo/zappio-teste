import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';
import fetch from 'node-fetch';

function removeUndefinedDeep(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedDeep).filter((v) => v !== undefined);
  }
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => [key, removeUndefinedDeep(value)])
    );
  }
  return obj;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log("ML_PRODUCTS_SYNC_START");

    const userId = req.query.userId || req.body?.userId;
    if (!userId) {
       // fallback, could use auth context if available
    }

    const hasFirebaseServiceAccountKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

    if (!admin.apps.length) {
      if (!hasFirebaseServiceAccountKey) {
        return res.status(500).json({ ok: false, error: "Firebase Admin not initialized" });
      }

      let serviceAccount: any = null;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
      } catch (error: any) {
        return res.status(500).json({ ok: false, error: "Invalid service account JSON" });
      }

      try {
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } catch (error: any) {
         return res.status(500).json({ ok: false, error: "Failed to initialize Firebase Admin" });
      }
    }

    const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";

    const { getFirestore } = await import("firebase-admin/firestore");
    let db;
    try {
        db = getFirestore(admin.app(), databaseId);
    } catch (e) {
        db = admin.firestore();
        try {
            db.settings({ databaseId, ignoreUndefinedProperties: true });
        } catch (err) {}
    }

    let query = db.collection("ecommerce_keys")
      .where("platform", "==", "mercadolivre")
      .where("status", "==", "connected");
      
    if (userId) {
       query = query.where("user_id", "==", userId);
    }

    const qs = await query.limit(1).get();

    if (qs.empty) {
      return res.status(200).json({ ok: false, error: "not_connected" });
    }

    const integration = qs.docs[0].data();
    const { seller_id, access_token } = integration;

    if (!seller_id || !access_token) {
        return res.status(200).json({ ok: false, error: "not_connected" });
    }

    // Fetch items from Mercado Livre
    const searchRes = await fetch(`https://api.mercadolibre.com/users/${seller_id}/items/search`, {
        headers: { Authorization: `Bearer ${access_token}` }
    });

    if (searchRes.status === 401) {
        return res.status(401).json({ ok: false, error: "Token expirado. Reconecte o Mercado Livre." });
    }

    if (!searchRes.ok) {
        const errText = await searchRes.text();
        console.error("ML_PRODUCTS_SYNC_ERROR", searchRes.status, errText);
        return res.status(500).json({ ok: false, error: "Erro ao buscar produtos do Mercado Livre" });
    }

    const searchData: any = await searchRes.json();
    const itemIds: string[] = searchData.results || [];

    console.log("ML_PRODUCTS_ITEM_IDS_FOUND", { count: itemIds.length });

    if (itemIds.length === 0) {
        return res.status(200).json({ ok: true, count: 0 });
    }

    // Fetch details for each item. ML allows fetching up to 20 items per request, but we can do one by one or batched.
    // Let's do batched: /items?ids=ITEM1,ITEM2 (max 20)
    let syncCount = 0;
    
    for (let i = 0; i < itemIds.length; i += 20) {
        const batchIds = itemIds.slice(i, i + 20);
        const detailsRes = await fetch(`https://api.mercadolibre.com/items?ids=${batchIds.join(',')}`, {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        if (detailsRes.ok) {
            const detailsData: any = await detailsRes.json();
            
            for (const itemWrapper of detailsData) {
                if (itemWrapper.code === 200 && itemWrapper.body) {
                    const item = itemWrapper.body;
                    const productId = item.id;
                    
                    const productData = removeUndefinedDeep({
                        id: item.id,
                        title: item.title,
                        price: item.price,
                        original_price: item.original_price || null,
                        currency_id: item.currency_id,
                        available_quantity: item.available_quantity,
                        sold_quantity: item.sold_quantity,
                        condition: item.condition,
                        permalink: item.permalink,
                        thumbnail: item.thumbnail,
                        pictures: item.pictures?.map((p: any) => p.url) || [],
                        status: item.status,
                        seller_id: integration.seller_id,
                        user_id: integration.user_id || null, // keeping track of who owns this product
                        category_id: item.category_id,
                        listing_type_id: item.listing_type_id,
                        last_synced_at: new Date().toISOString(),
                        raw: item
                    });

                    await db.collection("mercadolivre_products").doc(String(productId)).set(productData, { merge: true });
                    syncCount++;
                }
            }
        } else {
             console.error("ML_PRODUCTS_SYNC_ERROR batch fetch failed", batchIds);
        }
    }

    console.log("ML_PRODUCTS_SAVE_SUCCESS", { count: syncCount });
    return res.status(200).json({ ok: true, count: syncCount });

  } catch (error: any) {
    console.error("ML_PRODUCTS_SYNC_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
