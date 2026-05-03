import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
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
          const { loadExistingInstances } = await import("./whatsappService.ts");
          loadExistingInstances().catch(e => console.error("[Server] Auto-load instances error:", e));

          // Campaign Scheduler
          const { startScheduler } = await import("./campaignScheduler.ts");
          startScheduler();
          console.log("[Server] Scheduler started");
        } catch (e) {
          console.error("[Server] Error loading background services:", e);
        }

        console.log(`Server running on http://localhost:${PORT}`);
      });
    } else {
      console.log("[Server] Running on Vercel, skipping app.listen");
    }
    
    return app;
  } catch (error) {
    console.error("[Server] Critical startup error:", error);
    process.exit(1);
  }
}

const appPromise = startServer();

export default async function (req: any, res: any) {
  const app = await appPromise;
  if (app) {
    return app(req, res);
  }
}
