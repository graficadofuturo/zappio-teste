import { getAdminDb } from "../../../src/api/firebaseAdmin";

export default async function handler(req, res) {
  try {
    const db = await getAdminDb();
    const { userId } = req.query;

    let query = db.collection("ecommerce_keys")
      .where("platform", "==", "mercadolivre")
      .where("status", "==", "connected");
      
    if (userId) {
        query = query.where("user_id", "==", userId);
    }

    const qs = await query.limit(1).get();

    if (qs.empty) {
      return res.status(200).json({ connected: false });
    }

    const doc = qs.docs[0].data();

    return res.status(200).json({
      connected: true,
      platform: "mercadolivre",
      seller_id: doc.seller_id,
      account_name: doc.account_name,
      nickname: doc.nickname,
      mlUserId: doc.seller_id, // For backward compatibility with frontend
      site_id: doc.site_id,
      connectedAt: doc.connected_at,
      updated_at: doc.updated_at
    });
  } catch (error) {
    console.error("ML_STATUS_ERROR", error);
    return res.status(200).json({ connected: false, error: error.message });
  }
}
