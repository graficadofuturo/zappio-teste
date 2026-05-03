import { getAdminDb } from "../../../lib/firebaseAdmin.js";

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

    const db = getAdminDb();
    
    // First try the user-specific path if userId is available
    let doc = null;
    if (userId && userId !== "unknown") {
      doc = await db.collection("users").doc(userId).collection("integrations").doc("mercadolivre").get();
    }
    
    // Fallback to the global integrations/mercadolivre path requested in the latest prompt
    if (!doc || !doc.exists) {
      doc = await db.collection("integrations").doc("mercadolivre").get();
    }

    if (doc.exists) {
       const data = doc.data() || {};
       
       const connected = data.connected === true || data.status === "connected" || !!data.access_token;

       console.log("ML_STATUS_CHECK", {
         path: doc.ref.path,
         found: true,
         connected: connected,
         status: data?.status
       });

       return res.status(200).json({
         ok: true,
         connected,
         status: connected ? "connected" : "not_connected",
         mlUserId: data.ml_user_id || data.seller_id || null,
         nickname: data.ml_nickname || data.nickname || data.account_name || null,
         email: data.ml_email || data.email || null,
         connectedAt: data.connected_at || null
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
