import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/debug-env", (req, res) => {
    res.json({ key: process.env.GEMINI_API_KEY });
  });

  // API Routes
  app.post("/api/generate-copy", async (req, res) => {
    try {
      const { productUrl, aiObjective, aiTone, campaignName } = req.body;

      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY" || process.env.GEMINI_API_KEY === "placeholder") {
        console.warn("Using mock copy because Gemini API key is missing.");
        return res.json({ variations: [
          { title: "Versão Curta", text: `Olá! 🚀 Aproveite nossa promoção: ${campaignName}\n\n👉 ${productUrl}\n\nGaranta já!` },
          { title: "Versão Persuasiva", text: `Você não pode perder! ✨\n\nEstamos com uma condição especial na campanha *${campaignName}*.\n\nVeja todos os detalhes e aproveite antes que acabe:\n👉 ${productUrl}` },
          { title: "Versão Urgente", text: `🚨 ÚLTIMA CHANCE!\n\nAs ofertas da *${campaignName}* estão acabando.\n\nCorra e acesse o link:\n👉 ${productUrl}` }
        ]});
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Você é um copywriter especialista em conversões via WhatsApp.
Crie 3 variações de mensagens curtas, persuasivas e naturais.

DADOS DA CAMPANHA:
Nome da Campanha: ${campaignName || 'Não especificado'}
Objetivo: ${aiObjective || 'Vender'}
Tom de Voz: ${aiTone || 'Persuasivo'}
Contexto / Oferta: ${productUrl || 'Não especificado'}

DIRETRIZES PARA AS MENSAGENS:
1. Adapte o texto ao "Objetivo" e ao "Tom de Voz".
2. Use quebras de linha para facilitar a leitura.
3. Se houver variáveis no contexto (ex: {{nome_produto}}), você pode usar para ser substituído depois, mas se não houver, crie texto fluido genérico.
4. IMPORTANTE: Use obrigatoriamente as seguintes CHAVES DINÂMICAS do Mercado Livre se a campanha for de produto, pois elas serão substituídas automaticamente pelo sistema:
   {product_title} - Nome do produto
   {product_price} - Preço (já formatado R$ XX,XX)
   {product_discount} - Porcentagem de desconto ("10% OFF")
   {product_old_price} - Preço original sem desconto
   {product_link} - O link para a página do afiliado ou o link original
5. Inclua formatações do whatsapp (*negrito*, _itálico_) em pontos chaves discretamente.
6. Seja focado em atrair a ação.
7. Retorne EXATAMENTE um array JSON contendo objetos no seguinte formato:
[
  { "title": "Nome da Variação (ex: Curta, Urgente, Direta)", "text": "Corpo da mensagem do WhatsApp" },
  { "title": "Nome da Variação 2", "text": "..." },
  { "title": "Nome da Variação 3", "text": "..." }
]`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const responseText = response.text || "[]";
      try {
         const variations = JSON.parse(responseText);
         res.json({ variations });
      } catch (e) {
         res.json({ text: responseText });
      }
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to generate copy" });
    }
  });

  app.get("/api/whatsapp/status", async (req, res) => {
    const { instanceId } = req.query;
    if (!instanceId || typeof instanceId !== 'string') {
      return res.status(400).json({ error: "instanceId is required" });
    }
    const { instanceStatus } = await import("./whatsappService.ts");
    const status = instanceStatus.get(instanceId) || { status: 'disconnected' };
    res.json(status);
  });

  app.get("/api/whatsapp/sync", async (req, res) => {
    const { instanceId } = req.query;
    if (!instanceId || typeof instanceId !== 'string') return res.status(400).json({ error: "instanceId is required" });
    const { instanceStatus, instances } = await import("./whatsappService.ts");
    const status = instanceStatus.get(instanceId);
    if (!status) return res.status(404).json({ error: "not found" });
    
    // Actively fetch groups if connected
    const sock = instances.get(instanceId);
    if (sock && status.status === 'connected') {
        try {
           const groups = await sock.groupFetchAllParticipating();
           status.groups = Object.values(groups);
        } catch (e) {
           console.error("Error active fetching groups:", e);
        }
    }
    
    res.json({
      groups: status.groups || [],
      contacts: status.contacts || []
    });
  });

  app.post("/api/whatsapp/connect", async (req, res) => {
    const { instanceId } = req.body;
    if (!instanceId) return res.status(400).json({ error: "instanceId is required" });
    const { connectWhatsApp } = await import("./whatsappService.ts");
    const status = await connectWhatsApp(instanceId);
    res.json(status);
  });

  app.post("/api/whatsapp/disconnect", async (req, res) => {
    const { instanceId } = req.body;
    if (!instanceId) return res.status(400).json({ error: "instanceId is required" });
    const { disconnectWhatsApp } = await import("./whatsappService.ts");
    await disconnectWhatsApp(instanceId);
    res.json({ success: true });
  });

  app.get("/api/integrations/mercadolivre/debug-config", (req, res) => {
    res.json({
      hasClientId: !!process.env.ML_CLIENT_ID,
      hasClientSecret: !!process.env.ML_CLIENT_SECRET,
      redirectUri: process.env.ML_REDIRECT_URI,
      appBaseUrl: process.env.APP_BASE_URL,
      webhookUrl: process.env.ML_WEBHOOK_URL
    });
  });

  app.get("/api/integrations/mercadolivre/ping", (req, res) => {
    res.send("Mercado Livre API OK");
  });

  app.get("/api/integrations/mercadolivre/connect", async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId) {
         res.status(400).json({ error: "Missing userId" });
         return;
      }
      
      const { randomBytes } = await import("crypto");
      const state = randomBytes(16).toString("hex");
      res.cookie('ml_oauth_state', JSON.stringify({ state, userId: userId as string }), { httpOnly: true, maxAge: 1000 * 60 * 10, sameSite: 'lax', secure: true });

      const redirectUri = process.env.ML_REDIRECT_URI || "";
      const authorizationUrl =
        "https://auth.mercadolivre.com.br/authorization" +
        "?response_type=code" +
        "&client_id=" + process.env.ML_CLIENT_ID +
        "&redirect_uri=" + encodeURIComponent(redirectUri) +
        "&state=" + state;
      
      console.log("[ML OAuth Connect] ML_CLIENT_ID exists:", !!process.env.ML_CLIENT_ID);
      console.log("[ML OAuth Connect] ML_CLIENT_SECRET exists:", !!process.env.ML_CLIENT_SECRET);
      console.log("[ML OAuth Connect] ML_REDIRECT_URI used:", redirectUri);
      console.log("[ML OAuth Connect] Generated Auth URL:", authorizationUrl);
      
      res.redirect(authorizationUrl);
    } catch (e: any) {
      console.error("[ML OAuth] Connect route error:", e);
      const APP_BASE_URL = process.env.APP_BASE_URL;
      if (e.message?.includes('config') || e.message?.includes('ML_CLIENT')) {
          res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=config_error`);
      } else {
          res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=error`);
      }
    }
  });

  app.get("/api/integrations/mercadolivre/callback", async (req, res) => {
    const APP_BASE_URL = process.env.APP_BASE_URL;
    const redirectUri = process.env.ML_REDIRECT_URI || `${APP_BASE_URL}/api/integrations/mercadolivre/callback`;
    try {
      console.log("[ML OAuth Callback] Query Params:", req.query);
      const { code, state, error, error_description } = req.query;

      console.log("[ML OAuth Callback] Received code:", !!code);
      console.log("[ML OAuth Callback] Received state:", !!state);
      console.log("[ML OAuth Callback] Received error:", !!error);
      console.log("[ML OAuth Callback] APP_BASE_URL used:", APP_BASE_URL);
      console.log("[ML OAuth Callback] ML_REDIRECT_URI used:", redirectUri);

      if (error || error_description) {
         console.error("[ML OAuth Callback] Error from ML:", error, error_description);
         console.log("[ML OAuth Callback] Redirecting to:", `${APP_BASE_URL}/dashboard/integrations?mercadolivre=error`);
         res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=error`);
         return;
      }

      if (!code) {
         console.error("[ML OAuth] Missing code in callback. Query:", req.query);
         console.log("[ML OAuth Callback] Redirecting to:", `${APP_BASE_URL}/dashboard/integrations?mercadolivre=missing_code`);
         res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=missing_code`);
         return;
      }

      const cookieDataStr = req.headers.cookie?.split('; ').find(row => row.startsWith('ml_oauth_state='))?.split('=')[1];
      if (!cookieDataStr) {
         console.error("[ML OAuth] Missing or expired state cookie.");
         res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=invalid_state`);
         return;
      }

      const cookieData = JSON.parse(decodeURIComponent(cookieDataStr));
      if (cookieData.state !== state) {
         console.error("[ML OAuth] State mismatch.", { received: state, expected: cookieData.state });
         res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=invalid_state`);
         return;
      }

      const userId = cookieData.userId;

      const { exchangeCodeForToken } = await import("./src/lib/mercadolivre/mlService.ts");
      await exchangeCodeForToken(code as string, userId, redirectUri);
      
      console.log("[ML OAuth Callback] Success, redirecting to:", `${APP_BASE_URL}/dashboard/integrations?mercadolivre=connected`);
      res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=connected`);
    } catch (e: any) {
      console.error("[ML OAuth] Exception in callback:", e);
      const reason = encodeURIComponent(e.message || 'unknown error');
      res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=token_error&reason=${reason}`);
    }
  });

  app.post("/api/integrations/mercadolivre/sync", async (req, res) => {
    try {
      const { integrationId } = req.body;
      const { syncMLProducts } = await import("./src/lib/mercadolivre/mlService.ts");
      const count = await syncMLProducts(integrationId);
      res.json({ success: true, count });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to sync ML products" });
    }
  });

  app.get("/api/webhooks/mercadolivre", (req, res) => {
    res.status(200).send("Mercado Livre webhook ativo");
  });

  app.post("/api/webhooks/mercadolivre", (req, res) => {
    try {
      console.log("[ML Webhook] Received payload:", req.body);
      res.status(200).send("OK");
    } catch (e: any) {
      console.error("[ML Webhook] Error:", e);
      res.status(200).send("OK-Error");
    }
  });

  app.post("/api/whatsapp/send", async (req, res) => {
    const { instanceId, to, message, image_url } = req.body;
    if (!instanceId || !to || !message) {
      return res.status(400).json({ error: "instanceId, to, and message are required" });
    }
    const { sendMessage } = await import("./whatsappService.ts");
    try {
      await sendMessage(instanceId, to, message, image_url);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to send message" });
    }
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
