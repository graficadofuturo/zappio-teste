import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = req.query.userId;
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

    let query = db.collection("mercadolivre_products") as any;
    
    if (userId) {
       query = query.where("user_id", "==", userId);
    }

    const qs = await query.orderBy("last_synced_at", "desc").get();
    
    const products = qs.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
    }));

    return res.status(200).json({ ok: true, products });

  } catch (error: any) {
    console.error("ML_PRODUCTS_LIST_ERROR", error);
    
    // If the index doesn't exist, fallback to fetching all and sorting in JS, or just ignoring order
    if (error.message && error.message.includes("indexes")) {
        try {
            const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
            const { getFirestore } = await import("firebase-admin/firestore");
            let db;
            try { db = getFirestore(admin.app(), databaseId); } 
            catch (e) { db = admin.firestore(); }
            
            let query = db.collection("mercadolivre_products") as any;
            if (req.query.userId) query = query.where("user_id", "==", req.query.userId);
            
            const qs = await query.get();
            const products = qs.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
            products.sort((a: any, b: any) => {
               const timeA = new Date(a.last_synced_at || 0).getTime();
               const timeB = new Date(b.last_synced_at || 0).getTime();
               return timeB - timeA;
            });
            return res.status(200).json({ ok: true, products });
        } catch(fallbackErr) {
            return res.status(500).json({ ok: false, error: error.message });
        }
    }

    return res.status(500).json({ ok: false, error: error.message });
  }
}
