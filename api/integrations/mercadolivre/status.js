import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    let userId = req.query?.userId;

    if (!userId) {
       // fallback to cookie
       if (req.headers.cookie) {
            const cookies = req.headers.cookie.split(';').map(c => c.trim());
            const mlUserIdCookie = cookies.find(c => c.startsWith('ml_oauth_userId='));
            if (mlUserIdCookie) {
                userId = mlUserIdCookie.split('=')[1];
            }
       }
    }

    if (!userId || userId === "unknown") {
       return res.json({
         ok: true,
         connected: false,
         status: "not_connected"
       });
    }

    const apps = admin.apps || [];
    if (apps.length === 0) {
      const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "";
      if (serviceAccountBase64.trim()) {
        const serviceAccount = JSON.parse(
          Buffer.from(serviceAccountBase64, 'base64').toString('ascii')
        );
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } else {
        admin.initializeApp();
      }
    }

    const db = getFirestore();
    const doc = await db.collection("users").doc(userId).collection("integrations").doc("mercadolivre").get();

    if (doc.exists) {
       const data = doc.data();

       console.log("ML_STATUS_CHECK", {
         path: `users/${userId}/integrations/mercadolivre`,
         found: true,
         connected: data?.connected,
         status: data?.status
       });

       return res.json({
         ok: true,
         connected: data.connected === true || data.status === "connected",
         status: data.status || "connected",
         provider: data.provider || "mercadolivre",
         mlUserId: data.ml_user_id || data.seller_id,
         nickname: data.nickname || data.account_name,
         connectedAt: data.connected_at
       });
    }

    console.log("ML_STATUS_CHECK", {
      path: `users/${userId}/integrations/mercadolivre`,
      found: false,
      connected: false
    });

    return res.json({
      ok: true,
      connected: false,
      status: "not_connected"
    });
  } catch (error) {
    console.error("ML_STATUS_ERROR", {
      message: error?.message,
      stack: error?.stack
    });
    return res.status(200).json({ ok: false, connected: false, error: error?.message || "status_exception" });
  }
}
