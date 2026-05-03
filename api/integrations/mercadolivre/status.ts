import { VercelRequest, VercelResponse } from "@vercel/node";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getFirebaseDb() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  const app = getApps().length
    ? getApps()[0]
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

    console.log("ML_STATUS_START", { userId });
    
    if (!userId || userId === 'undefined') {
        console.log("ML_STATUS_NOT_FOUND", "No user ID provided");
        return res.status(200).json({ 
          ok: true,
          connected: false,
          marketplace: "mercadolivre" 
        });
    }

    console.log("ML_STATUS_FIRESTORE_PATH", `users/${userId}/integrations/mercadolivre`);
    
    const docRef = db.collection("users").doc(String(userId)).collection("integrations").doc("mercadolivre");
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.log("ML_STATUS_NOT_FOUND");
      return res.status(200).json({ 
        ok: true,
        connected: false,
        marketplace: "mercadolivre" 
      });
    }

    const docData = docSnap.data();
    
    if (docData?.connected !== true) {
      console.log("ML_STATUS_NOT_FOUND", "Docs exists but connected is false");
      return res.status(200).json({ 
        ok: true,
        connected: false,
        marketplace: "mercadolivre" 
      });
    }
    console.log("ML_STATUS_FOUND", { mlUserId: docData.ml_user_id || docData.seller_id });

    return res.status(200).json({
      ok: true,
      connected: true,
      marketplace: "mercadolivre",
      mlUserId: docData.ml_user_id || docData.seller_id,
      nickname: docData.nickname || null,
      email: docData.email || null,
      connectedAt: docData.connected_at || docData.connectedAt,
      expiresAt: docData.token_expires_at || null
    });
  } catch (error: any) {
    return res.status(500).json({ 
      ok: false, 
      connected: false, 
      error: error.message 
    });
  }
}
