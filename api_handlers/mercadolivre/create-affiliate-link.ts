import { getAdminDb } from "../_lib/firebase-admin";
import { createAffiliateLinkFromFirestore } from "../_lib/ml-utils";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { url, uid } = req.body;
    if (!uid || !url) {
      return res.status(400).json({ ok: false, error: "Missing uid or url", fallback: url });
    }

    const db = getAdminDb();
    const result = await createAffiliateLinkFromFirestore(url, uid, db);

    if (result.ok && result.short_url) {
      return res.json({
         ok: true,
         short_url: result.short_url,
         affiliateUrl: result.short_url
      });
    } else {
      return res.json({
         ok: false,
         fallback: result.fallback,
         error: result.error || 'Unknown error'
      });
    }
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message, fallback: req.body?.url });
  }
}
