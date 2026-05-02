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

  app.get("/api/integrations/mercadolivre/debug-auth-url", (req, res) => {
    const clientId = process.env.ML_CLIENT_ID;
    const redirectUri = process.env.ML_REDIRECT_URI;

    const missing = {
      clientId: !clientId,
      redirectUri: !redirectUri,
    };

    if (!clientId || !redirectUri) {
      res.status(500).json({
        ok: false,
        error: "missing_config",
        missing,
      });
      return;
    }

    const state = "debug-state";

    const authorizationUrl =
      "https://auth.mercadolivre.com.br/authorization" +
      "?response_type=code" +
      "&client_id=" + encodeURIComponent(clientId) +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&state=" + encodeURIComponent(state);

    res.json({
      ok: true,
      redirectUri,
      authorizationUrl,
      expectedRedirectUri: "https://zappio-teste.vercel.app/api/integrations/mercadolivre/callback",
      containsVercelDomain: authorizationUrl.includes("zappio-teste.vercel.app"),
      containsOldRunAppDomain: authorizationUrl.includes("ais-pre-jgg5kfa6ozln2cfdkicjmx-62492944237.us-west2.run.app"),
    });
  });

  app.get("/api/integrations/mercadolivre/ping", (req, res) => {
    res.send("Mercado Livre API OK");
  });

  app.get("/api/integrations/mercadolivre/connect", async (req, res) => {
    try {
      const { userId } = req.query;
      const { randomBytes } = await import("crypto");
      const state = randomBytes(16).toString("hex");
      res.cookie('ml_oauth_state', JSON.stringify({ state, userId: userId ? String(userId) : "unknown" }), { httpOnly: true, maxAge: 1000 * 60 * 10, sameSite: 'lax', secure: true });

      const redirectUri = process.env.ML_REDIRECT_URI || "https://zappio-teste.vercel.app/api/integrations/mercadolivre/callback";
      const authorizationUrl =
        "https://auth.mercadolivre.com.br/authorization" +
        "?response_type=code" +
        "&client_id=" + process.env.ML_CLIENT_ID +
        "&redirect_uri=" + encodeURIComponent(redirectUri) +
        "&state=" + state;
      
      res.redirect(authorizationUrl);
    } catch (e: any) {
      console.error("[ML OAuth] Connect route error:", e);
      const APP_BASE_URL = process.env.APP_BASE_URL || "https://zappio-teste.vercel.app";
      res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=error`);
    }
  });

  app.get("/api/integrations/mercadolivre/callback", async (req, res) => {
    const APP_BASE_URL = process.env.APP_BASE_URL || "https://zappio-teste.vercel.app";
    const integrationsPath = "/dashboard/integrations";
    const redirectUri = process.env.ML_REDIRECT_URI || "https://zappio-teste.vercel.app/api/integrations/mercadolivre/callback";
    try {
      console.log("[ML OAuth Callback Local] Query Params:", req.query);
      const { code, state, error, error_description } = req.query;

      console.log("ML_CALLBACK_START", {
        hasCode: Boolean(code),
        hasState: Boolean(state),
        hasClientId: Boolean(process.env.ML_CLIENT_ID),
        hasClientSecret: Boolean(process.env.ML_CLIENT_SECRET),
        redirectUri: process.env.ML_REDIRECT_URI,
        appBaseUrl: process.env.APP_BASE_URL
      });

      if (error || error_description) {
         res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=oauth_error`);
         return;
      }

      if (!code) {
         res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=missing_code`);
         return;
      }

      const cookieDataStr = req.headers.cookie?.split('; ').find(row => row.startsWith('ml_oauth_state='))?.split('=')[1];
      let validState = false;
      let userId: string | null = null;
      let cookieData: any = {};
      if (cookieDataStr) {
          try {
              cookieData = JSON.parse(decodeURIComponent(cookieDataStr));
              if (cookieData.state === state) {
                  validState = true;
                  userId = cookieData.userId;
              }
          } catch (e) {}
      }

      if (!validState) {
         console.log("Invalid state, continuing in debug mode");
      }

      const clientId = process.env.ML_CLIENT_ID || "";
      const clientSecret = process.env.ML_CLIENT_SECRET || "";

      if (!clientId || !clientSecret) {
          console.error("ML credentials not configured");
          res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=config_error`);
          return;
      }

      const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
          body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: clientId,
              client_secret: clientSecret,
              code: code as string,
              redirect_uri: redirectUri
          }).toString()
      });

      if (!tokenRes.ok) {
          const tokenErrorBody = await tokenRes.text();
          console.log("ML_TOKEN_RESPONSE", {
            status: tokenRes.status,
            ok: tokenRes.ok,
            body: tokenErrorBody
          });
          console.error("Failed to exchange code. Status:", tokenRes.status, "Body:", tokenErrorBody);
          res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=token_error`);
          return;
      }

      const tokenData: any = await tokenRes.json();
      console.log("ML_TOKEN_RESPONSE", {
        status: tokenRes.status,
        ok: tokenRes.ok,
        body: null
      });

      let mlUser = {} as any;
      try {
          const userRes = await fetch('https://api.mercadolibre.com/users/me', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` }
          });
          console.log("ML_USERS_ME_RESPONSE", {
            status: userRes.status,
            ok: userRes.ok
          });
          if (userRes.ok) {
              mlUser = await userRes.json();
          } else {
              res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=user_error`);
              return;
          }
      } catch (err) {
          res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=user_error`);
          return;
      }

      const admin = await import("firebase-admin");
      if (!admin.apps.length) {
          if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
              const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
              admin.initializeApp({
                  credential: admin.credential.cert(serviceAccount)
              });
          }
      }

      const db = admin.firestore();
      try {
          let existingDoc: any = null;
          let qs = await db.collection('ecommerce_keys')
              .where('user_id', '==', userId || 'unknown')
              .where('platform', '==', 'mercadolivre')
              .limit(1)
              .get();
          if (!qs.empty) existingDoc = qs.docs[0];

          const token_expires_at = tokenData.expires_in ? new Date(Date.now() + (tokenData.expires_in * 1000)) : admin.firestore.FieldValue.serverTimestamp();
          const payload = {
              user_id: userId || 'unknown',
              platform: 'mercadolivre',
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              seller_id: mlUser.id?.toString() || tokenData.user_id?.toString() || tokenData.seller_id,
              account_name: mlUser.nickname || '',
              expires_in: tokenData.expires_in,
              token_expires_at: token_expires_at,
              status: 'connected',
              connected_at: admin.firestore.FieldValue.serverTimestamp(),
          };

          if (existingDoc) await existingDoc.ref.update(payload);
          else await db.collection('ecommerce_keys').add(payload);
          
      } catch (e) {
          console.log("ML_SAVE_ERROR", e);
          console.error("Save Error:", e);
          res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
          return;
      }

      res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=connected`);
    } catch (e: any) {
      console.error("[ML OAuth Callback Local] Exception:", e);
      res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=error`);
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
