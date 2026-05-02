import { Router } from "express";

const router = Router();

router.get("/mercadolivre", (req, res) => {
  res.status(200).send("Mercado Livre webhook ativo");
});

router.post("/mercadolivre", (req, res) => {
  try {
    console.log("[ML Webhook] Received payload:", req.body);
    res.status(200).send("OK");
  } catch (e: any) {
    console.error("[ML Webhook] Error:", e);
    res.status(200).send("OK-Error");
  }
});

export default router;
