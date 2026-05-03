import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

// Import Routers
import aiRoutes from "./src/api/routes/ai.ts";
import whatsappRoutes from "./src/api/routes/whatsapp.ts";
import mercadolivreRoutes from "./src/api/routes/mercadolivre.ts";
import productRoutes from "./src/api/routes/products.ts";
import webhookRoutes from "./src/api/routes/webhooks.ts";
import campaignRoutes from "./src/api/routes/campaigns.ts";
import subscriptionRoutes from "./src/api/routes/subscriptions.ts";

import shopeeRouter from "./src/api/routes/shopee.ts";
import integrationsRouter from "./src/api/routes/integrations.ts";
import offersRouter from "./src/api/routes/offers.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/debug-env", (req, res) => {
    res.json({ key: process.env.GEMINI_API_KEY });
  });

  // Mount API Routes
  app.use("/api/shopee", shopeeRouter);
  app.use("/api/ai", aiRoutes);
  app.use("/api/whatsapp", whatsappRoutes);
  app.use("/api/integrations", integrationsRouter);
  app.use("/api/integrations/mercadolivre", mercadolivreRoutes);
  app.use("/api/mercadolivre/products", productRoutes);
  app.use("/api/mercadolivre/affiliate-products", productRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/campaigns", campaignRoutes);
  app.use("/api/offers", offersRouter);
  app.use("/api/subscriptions", subscriptionRoutes);

  app.get("/api/debug/firebase-admin", (req, res) => {
    let serviceAccountJsonValid = false;
    let hasProjectId = false;
    let hasClientEmail = false;
    let hasPrivateKey = false;
    let privateKeyLooksValid = false;

    const keyString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const hasServiceAccountKey = Boolean(keyString);

    if (hasServiceAccountKey) {
        try {
            const serviceAccount = JSON.parse(keyString as string);
            serviceAccountJsonValid = true;
            hasProjectId = Boolean(serviceAccount.project_id);
            hasClientEmail = Boolean(serviceAccount.client_email);
            hasPrivateKey = Boolean(serviceAccount.private_key);
            
            if (hasPrivateKey) {
                const pk = serviceAccount.private_key;
                privateKeyLooksValid = pk.includes("BEGIN PRIVATE KEY") && pk.includes("END PRIVATE KEY");
            }
        } catch (e) {
            // JSON parser failed
        }
    }

    res.json({
      hasServiceAccountKey,
      serviceAccountJsonValid,
      hasProjectId,
      hasClientEmail,
      hasPrivateKey,
      privateKeyLooksValid
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    const { loadExistingInstances } = await import("./whatsappService.ts");
    loadExistingInstances().catch(e => console.error("Auto-load instances error:", e));

    // Campaign Scheduler
    const { startScheduler } = await import("./campaignScheduler.ts");
    startScheduler();

    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
