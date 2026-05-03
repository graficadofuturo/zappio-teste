import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin.ts";

const router = Router();

router.get("/categories", async (req, res) => {
  try {
    const db = await getAdminDb();
    const querySnapshot = await db.collection("affiliate_offers").get();
    const categories = new Set<string>();
    categories.add("Todos");
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.category) {
        categories.add(data.category);
      }
    });

    res.status(200).json({ ok: true, categories: Array.from(categories) });
  } catch (error: any) {
    console.error("OFFERS_CATEGORIES_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
