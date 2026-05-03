import { VercelRequest, VercelResponse } from "@vercel/node";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getFirebaseDb() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  const apps = getApps();
  const app = apps.length
    ? apps[0]
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });

  return getFirestore(app, process.env.FIRESTORE_DATABASE_ID || "(default)");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const db = getFirebaseDb();
    const { userId } = req.query;

    if (!userId || userId === 'undefined') {
        return res.status(200).json({ 
          ok: true,
          connected: false,
          marketplace: "mercadolivre" 
        });
    }

    // First try the new path
    const docRef = db.collection("users").doc(String(userId)).collection("integrations").doc("mercadolivre");
    const docSnap = await docRef.get();

    let docData: any = null;

    if (docSnap.exists) {
      docData = docSnap.data();
    } else {
      // Fallback to old path
      const query = db.collection("ecommerce_keys")
        .where("platform", "==", "mercadolivre")
        .where("status", "==", "connected")
        .where("user_id", "==", String(userId));
      const qs = await query.get();
      if (!qs.empty) {
        docData = qs.docs[0].data();
      }
    }

    if (!docData || (docData.connected !== true && docData.status !== "connected")) {
      return res.status(200).json({ 
        ok: true,
        connected: false,
        marketplace: "mercadolivre" 
      });
    }

    console.log("ML_STATUS_SUCCESS", { mlUserId: docData.mlUserId || docData.ml_user_id || docData.seller_id });

    return res.status(200).json({
      connected: true,
      marketplace: "mercadolivre",
      mlUserId: docData.mlUserId || docData.ml_user_id || docData.seller_id,
      nickname: docData.nickname || null,
      email: docData.email || null,
      connectedAt: docData.connectedAt || docData.connected_at || null,
      expiresAt: docData.expiresAt || docData.token_expires_at || null
    });
  } catch (error: any) {
    console.error("ML_ERROR", "ML_STATUS_ERROR", error);
    return res.status(200).json({ 
      connected: false, 
      error: error.message 
    });
  }
}
