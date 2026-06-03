import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "path";

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

    // Mount Vercel-style API Routes dynamically
    const offersHandler = (await import("../api_handlers/offers")).default;
    const mlHandler = (await import("../api_handlers/mercadolivre")).default;
    
    const collectorRunHandler = (await import("../api_handlers/offers/collector/run")).default;
    const collectorCheckHandler = (await import("../api_handlers/cron/collect-offers")).default;
    const collectorStatusHandler = (await import("../api_handlers/offers/collector/status")).default;
    const offersListHandler = (await import("../api_handlers/offers/list")).default;
    const offersDebugHandler = (await import("../api_handlers/offers/debug")).default;

    app.all("/api/offers", offersHandler);
    app.all("/api/mercadolivre", mlHandler);
    
    app.all("/api/offers/collector/run", collectorRunHandler);
    app.all("/api/cron/collect-offers", collectorCheckHandler);
    app.all("/api/offers/collector/status", collectorStatusHandler);
    app.all("/api/offers/list", offersListHandler);
    app.all("/api/offers/debug", offersDebugHandler);

    // Mount API Routes dynamically
    console.log("[Server] Mounting routes...");
    const shopeeRouter = (await import("../src/api/routes/shopee")).default;
    const aiRoutes = (await import("../src/api/routes/ai")).default;
    const whatsappRoutes = (await import("../src/api/routes/whatsapp")).default;
    const mercadolivreRoutes = (await import("../src/api/routes/mercadolivre")).default;
    const productRoutes = (await import("../src/api/routes/products")).default;
    const webhookRoutes = (await import("../src/api/routes/webhooks")).default;
    const campaignRoutes = (await import("../src/api/routes/campaigns")).default;
    const subscriptionRoutes = (await import("../src/api/routes/subscriptions")).default;
    const integrationsRouter = (await import("../src/api/routes/integrations")).default;
    const offersRouter = (await import("../src/api/routes/offers")).default;

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
          const { loadExistingInstances } = await import("../whatsappService");
          loadExistingInstances().catch(e => console.error("[Server] Auto-load instances error:", e));

          // Campaign Scheduler
          const { startScheduler } = await import("../campaignScheduler");
          startScheduler();
          console.log("[Server] Scheduler started");

          // Campaign Send Worker
          const { startCampaignSendWorker } = await import("../src/workers/campaign-send-worker");
          startCampaignSendWorker();
          console.log("[Server] Campaign Send Worker started");

          // Affiliate Link Worker
          const { runWorker: startAffiliateWorker } = await import("../src/workers/affiliate-link-worker");
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
      const { getAdminDb } = await import("../src/api/firebaseAdmin");
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
