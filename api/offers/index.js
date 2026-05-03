import { getAdminDb } from "../../lib/firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { marketplace, category, status } = req.query;
    const db = getAdminDb();
    
    let query = db.collection("affiliate_offers");
    
    if (marketplace) {
      query = query.where("marketplace", "==", marketplace);
    }
    
    if (category) {
      query = query.where("category", "==", category);
    }
    
    if (status) {
      query = query.where("status", "==", status);
    } else {
      query = query.where("status", "==", "active");
    }
    
    // Lista as ofertas mais recentes primeiro
    query = query.orderBy("updated_at", "desc");
    
    const snapshot = await query.get();
    const offers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return res.status(200).json({
      ok: true,
      offers
    });

  } catch (error) {
    console.error("GET_OFFERS_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
