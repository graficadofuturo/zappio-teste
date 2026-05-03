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
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const db = getFirebaseDb();
    const { userId } = req.query;

    if (!userId || userId === 'undefined') {
        return res.status(400).json({ ok: false, error: "Missing user ID" });
    }

    const batch = db.batch();

    // 1. New path
    const docRef = db.collection("users").doc(String(userId)).collection("integrations").doc("mercadolivre");
    batch.set(docRef, {
      status: "disconnected",
      connected: false,
      access_token: null,
      refresh_token: null,
      accessToken: null,
      refreshToken: null,
      updated_at: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // 2. Legacy path
    const query = db.collection("ecommerce_keys")
      .where("platform", "==", "mercadolivre")
      .where("user_id", "==", String(userId));
      
    const qs = await query.get();

    if (!qs.empty) {
      qs.docs.forEach(doc => {
        batch.set(doc.ref, {
          status: "disconnected",
          connected: false,
          access_token: null,
          refresh_token: null,
          accessToken: null,
          refreshToken: null,
          updated_at: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });
    }

    await batch.commit();

    console.log("ML_DISCONNECT_SUCCESS");

    return res.status(200).json({
      ok: true,
      connected: false
    });
  } catch (error: any) {
    console.error("ML_ERROR", "ML_DISCONNECT_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
