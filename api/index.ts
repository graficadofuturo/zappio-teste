import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "path";

// Import Vercel handlers from renamed folder statically to ensure Vercel bundles them
import offersHandler from "../api_handlers/offers_handler.js";
import mlHandler from "../api_handlers/mercadolivre_handler.js";

import collectorRunHandler from "../api_handlers/offers/collector/run.js";
import collectorCheckHandler from "../api_handlers/cron/collect-offers.js";
import collectorStatusHandler from "../api_handlers/offers/collector/status.js";
import offersListHandler from "../api_handlers/offers/list.js";
import offersDebugHandler from "../api_handlers/offers/debug.js";

// Import Routers dynamically inside startServer or statically
import shopeeRouter from "../src/api/routes/shopee.js";
import aiRoutes from "../src/api/routes/ai.js";
import whatsappRoutes from "../src/api/routes/whatsapp.js";
import mercadolivreRoutes from "../src/api/routes/mercadolivre.js";
import productRoutes from "../src/api/routes/products.js";
import webhookRoutes from "../src/api/routes/webhooks.js";
import campaignRoutes from "../src/api/routes/campaigns.js";
import subscriptionRoutes from "../src/api/routes/subscriptions.js";
import integrationsRouter from "../src/api/routes/integrations.js";
import offersRouter from "../src/api/routes/offers.js";

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    app.use(express.json());
    app.use(cookieParser());
    
    console.log("[Server] Middleware initialized");

    app.get("/api/health", (req, res) => res.json({ status: "ok" }));
    
    app.get("/api/debug-env", (req, res) => {
      res.json({ key: process.env.GEMINI_API_KEY ? "Set" : "Not Set" });
    });

    // Mount Vercel-style API Routes
    app.all("/api/offers", offersHandler);
    app.all("/api/mercadolivre", mlHandler);
    
    app.all("/api/offers/collector/run", collectorRunHandler);
    app.all("/api/cron/collect-offers", collectorCheckHandler);
    app.all("/api/offers/collector/status", collectorStatusHandler);
    app.all("/api/offers/list", offersListHandler);
    app.all("/api/offers/debug", offersDebugHandler);

    // Mount API Routes
    console.log("[Server] Mounting routes...");
    app.use("/api/shopee", shopeeRouter);
    app.use("/api/ai", aiRoutes);
    app.use("/api/whatsapp", whatsappRoutes);
    app.use("/api/integrations/mercadolivre", mercadolivreRoutes);
    app.use("/api/integrations", integrationsRouter);
    app.use("/api/mercadolivre/products", productRoutes);
    app.use("/api/mercadolivre/affiliate-products", productRoutes);
    app.use("/api/webhooks", webhookRoutes);
    app.use("/api/campaigns", campaignRoutes);
    app.use("/api/offers", offersRouter);
    app.use("/api/subscriptions", subscriptionRoutes);
    
    console.log("[Server] Routes mounted");

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      console.log("[Server] Starting Vite in dev mode...");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      console.log("[Server] Starting in production mode...");
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    if (!process.env.VERCEL) {
      app.listen(PORT, "0.0.0.0", async () => {
        console.log(`[Server] Web server listening on port ${PORT}`);
        
        try {
          const { loadExistingInstances } = await import("../whatsappService.js");
          loadExistingInstances().catch(e => console.error("[Server] Auto-load instances error:", e));

          // Campaign Scheduler
          const { startScheduler } = await import("../campaignScheduler.js");
          startScheduler();
          console.log("[Server] Scheduler started");

          // Campaign Send Worker
          const { startCampaignSendWorker } = await import("../src/workers/campaign-send-worker.js");
          startCampaignSendWorker();
          console.log("[Server] Campaign Send Worker started");

          // Affiliate Link Worker
          const { runWorker: startAffiliateWorker } = await import("../src/workers/affiliate-link-worker.js");
          startAffiliateWorker();
          console.log("[Server] Affiliate Link Worker started");
        } catch (e) {
          console.error("[Server] Error loading background services:", e);
        }

        console.log(`Server running on http://localhost:${PORT}`);
      });
    } else {
      console.log("[Server] Running on Vercel, skipping app.listen");
    }
    
    return app;
  } catch (error: any) {
    console.error("[Server] Critical startup error:", error);
    try {
      const { getAdminDb } = await import("../src/api/firebaseAdmin.js");
      const db = getAdminDb();
      await db.collection("vercel_startup_errors").add({
        error: error.message || String(error),
        stack: error.stack || null,
        timestamp: new Date().toISOString()
      });
      console.log("[Server] Error logged to Firestore successfully.");
    } catch (logErr) {
      console.error("[Server] Failed to log error to Firestore:", logErr);
    }
    
    const errorApp = express();
    errorApp.all("*", (req, res) => {
      res.status(500).json({
        ok: false,
        error: "CRITICAL_STARTUP_ERROR",
        details: error.message || String(error),
        stack: error.stack || null
      });
    });
    return errorApp;
  }
}

const appPromise = startServer();

export default async function (req: any, res: any) {
  const app = await appPromise;
  if (app) {
    return app(req, res);
  }
}
