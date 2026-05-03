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
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const db = getFirebaseDb();
    const { userId } = req.query;

    let query = db.collection("ecommerce_keys")
      .where("platform", "==", "mercadolivre")
      .where("status", "==", "connected");
      
    if (userId && userId !== 'undefined') {
        query = query.where("user_id", "==", String(userId));
    }

    const qs = await query.get();

    if (qs.empty) {
      return res.status(200).json({ ok: true, connected: false });
    }

    const batch = db.batch();
    qs.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: "disconnected",
        connected: false,
        access_token: null,
        refresh_token: null,
        accessToken: null,
        refreshToken: null,
        updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    });

    await batch.commit();

    return res.status(200).json({
      ok: true,
      connected: false
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
