import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log("ML_STATUS_CHECK");

    const hasFirebaseServiceAccountKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

    if (!admin.apps.length) {
      if (!hasFirebaseServiceAccountKey) {
        return res.status(500).json({ connected: false, error: "Firebase Admin not initialized" });
      }

      let serviceAccount: any = null;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
      } catch (error: any) {
        return res.status(500).json({ connected: false, error: "Invalid service account JSON" });
      }

      try {
        if (serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } catch (error: any) {
         return res.status(500).json({ connected: false, error: "Failed to initialize Firebase Admin" });
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
            db.settings({ databaseId });
        } catch (err) {}
    }

    const qs = await db.collection("marketplace_integrations")
      .where("platform", "==", "mercadolivre")
      .where("status", "==", "connected")
      .limit(1)
      .get();

    if (qs.empty) {
      console.log("ML_STATUS_NOT_FOUND");
      return res.status(200).json({ connected: false });
    }

    console.log("ML_STATUS_FOUND");
    const doc = qs.docs[0].data();

    return res.status(200).json({
      connected: true,
      platform: "mercadolivre",
      seller_id: doc.seller_id,
      account_name: doc.account_name,
      nickname: doc.nickname,
      site_id: doc.site_id,
      connected_at: doc.connected_at,
      updated_at: doc.updated_at
    });
  } catch (error: any) {
    console.error("ML_STATUS_ERROR", error);
    if (error?.code === 5 || (error?.message && error.message.includes('NOT_FOUND'))) {
      return res.status(200).json({ connected: false });
    }
    return res.status(500).json({ connected: false, error: error.message });
  }
}
