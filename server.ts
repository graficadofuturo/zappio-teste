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

  app.get("/api/integrations/mercadolivre/status", async (req, res) => {
    try {
      console.log("ML_STATUS_CHECK");

      const hasFirebaseServiceAccountKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

      const admin = await import("firebase-admin");

      if (!admin.apps.length) {
        if (!hasFirebaseServiceAccountKey) {
          res.status(500).json({ connected: false, error: "Firebase Admin not initialized" });
          return;
        }

        let serviceAccount: any = null;
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
        } catch (error: any) {
          res.status(500).json({ connected: false, error: "Invalid service account JSON" });
          return;
        }

        try {
          if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
          }
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        } catch (error: any) {
           res.status(500).json({ connected: false, error: "Failed to initialize Firebase Admin" });
           return;
        }
      }

      const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";

      const { getFirestore } = await import("firebase-admin/firestore");
      let db;
      try {
          db = getFirestore(admin.app(), databaseId);
      } catch (e) {
          db = admin.firestore();
          try {
              db.settings({ databaseId });
          } catch (err) {}
      }

      const qs = await db.collection("marketplace_integrations")
        .where("platform", "==", "mercadolivre")
        .where("status", "==", "connected")
        .limit(1)
        .get();

      if (qs.empty) {
        console.log("ML_STATUS_NOT_FOUND");
        res.status(200).json({ connected: false });
        return;
      }

      console.log("ML_STATUS_FOUND");
      const doc = qs.docs[0].data();

      res.status(200).json({
        connected: true,
        platform: "mercadolivre",
        seller_id: doc.seller_id,
        account_name: doc.account_name,
        nickname: doc.nickname,
        site_id: doc.site_id,
        connected_at: doc.connected_at,
        updated_at: doc.updated_at
      });
    } catch (error: any) {
      if (error?.code === 5 || (error?.message && error.message.includes('NOT_FOUND'))) {
        res.status(200).json({ connected: false });
        return;
      }
      console.error("ML_STATUS_ERROR", error);
      res.status(500).json({ connected: false, error: error.message });
    }
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
      res.redirect(`${APP_BASE_URL}/dashboard/integrations?mercadolivre=config_error`);
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
      
      console.log("ML_SAVE_START");
      
      const hasFirebaseServiceAccountKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      console.log({ hasFirebaseServiceAccountKey });

      if (!admin.apps.length) {
          if (!hasFirebaseServiceAccountKey) {
              console.error("ML_FIREBASE_ADMIN_INIT_ERROR: Firebase Admin not initialized and FIREBASE_SERVICE_ACCOUNT_KEY not set");
              res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
              return;
          }

          let serviceAccount: any = null;
          try {
              serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
          } catch (error: any) {
              console.error("ML_FIREBASE_SERVICE_ACCOUNT_PARSE_ERROR", error.message);
              res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
              return;
          }

          try {
              if (serviceAccount.private_key) {
                  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
              }
              admin.initializeApp({
                  credential: admin.credential.cert(serviceAccount)
              });
          } catch (error: any) {
              console.error("ML_FIREBASE_ADMIN_INIT_ERROR", error.message);
              res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
              return;
          }
      }

      const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
      let parsedProjectId = "unknown";
      try {
          if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
              const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
              if (sa && sa.project_id) parsedProjectId = sa.project_id;
          }
      } catch (e) {}

      console.log("FIRESTORE_TARGET", {
        projectId: parsedProjectId,
        databaseId
      });

      const { getFirestore } = await import("firebase-admin/firestore");
      let db;
      try {
          db = getFirestore(admin.app(), databaseId);
      } catch (e) {
          db = admin.firestore();
          try {
              db.settings({ databaseId });
          } catch (err) {}
      }
      try {
          try {
              db.settings({ ignoreUndefinedProperties: true });
          } catch (e) {}

          const sellerId = mlUser.id?.toString() || tokenData.user_id?.toString() || tokenData.seller_id;
          const accountName = mlUser.first_name ? `${mlUser.first_name} ${mlUser.last_name || ''}`.trim() : mlUser.nickname;
          const nickname = mlUser.nickname;
          const siteId = mlUser.site_id;
          const accessToken = tokenData.access_token;
          const refreshToken = tokenData.refresh_token;
          const expiresIn = tokenData.expires_in;

          function removeUndefinedDeep(obj: any): any {
            if (Array.isArray(obj)) {
              return obj.map(removeUndefinedDeep).filter((v) => v !== undefined);
            }
            if (obj && typeof obj === "object") {
              return Object.fromEntries(
                Object.entries(obj)
                  .filter(([_, value]) => value !== undefined)
                  .map(([key, value]) => [key, removeUndefinedDeep(value)])
              );
            }
            return obj;
          }

          const integrationData = removeUndefinedDeep({
            user_id: userId || 'unknown',
            platform: "mercadolivre",
            seller_id: String(sellerId),
            account_name: accountName || null,
            nickname: nickname || null,
            site_id: siteId || null,
            access_token: accessToken || null,
            refresh_token: refreshToken || null,
            expires_in: expiresIn || null,
            token_expires_at: expiresIn
              ? new Date(Date.now() + expiresIn * 1000).toISOString()
              : null,
            status: "connected",
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          console.log("ML_SAVE_DATA_VALIDATION", {
            hasSellerId: Boolean(sellerId),
            hasAccessToken: Boolean(accessToken),
            hasRefreshToken: Boolean(refreshToken),
            keys: Object.keys(integrationData),
          });

          await db
            .collection("marketplace_integrations")
            .doc(String(sellerId))
            .set(integrationData, { merge: true });
            
      } catch (saveErr: any) {
          console.error("ML_FIRESTORE_SAVE_ERROR", {
              message: saveErr?.message,
              code: saveErr?.code,
              stack: saveErr?.stack,
          });

          if (saveErr?.code === 5 || (saveErr?.message && saveErr.message.includes('NOT_FOUND'))) {
              res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=firestore_not_found`);
              return;
          }

          res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=save_error`);
          return;
      }

      console.log("ML_SAVE_SUCCESS");

      res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=connected`);
    } catch (e: any) {
      console.error("ML_CALLBACK_EXCEPTION", {
        message: e?.message,
        name: e?.name,
        stack: e?.stack,
      });
      res.redirect(`${APP_BASE_URL}${integrationsPath}?mercadolivre=callback_exception`);
    }
  });

  app.post("/api/mercadolivre/products/sync", async (req, res) => {
    try {
      console.log("ML_PRODUCTS_SYNC_START");

      const userId = req.body?.userId;

      const hasFirebaseServiceAccountKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

      const admin = await import("firebase-admin");

      if (!admin.apps.length) {
        if (!hasFirebaseServiceAccountKey) {
          res.status(500).json({ ok: false, error: "Firebase Admin not initialized" });
          return;
        }

        let serviceAccount: any = null;
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
        } catch (error: any) {
          res.status(500).json({ ok: false, error: "Invalid service account JSON" });
          return;
        }

        try {
          if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
          }
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        } catch (error: any) {
           res.status(500).json({ ok: false, error: "Failed to initialize Firebase Admin" });
           return;
        }
      }

      const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";

      const { getFirestore } = await import("firebase-admin/firestore");
      let db;
      try {
          db = getFirestore(admin.app(), databaseId);
      } catch (e) {
          db = admin.firestore();
          try {
              db.settings({ databaseId });
          } catch (err) {}
      }
      try { db.settings({ ignoreUndefinedProperties: true }); } catch (e) {}

      let query = db.collection("marketplace_integrations")
        .where("platform", "==", "mercadolivre")
        .where("status", "==", "connected");
        
      if (userId) {
         query = query.where("user_id", "==", userId);
      }

      const qs = await query.limit(1).get();

      if (qs.empty) {
        res.status(200).json({ ok: false, error: "not_connected" });
        return;
      }

      const integration = qs.docs[0].data();
      const { seller_id, access_token } = integration;

      if (!seller_id || !access_token) {
          res.status(200).json({ ok: false, error: "not_connected" });
          return;
      }

      const searchRes = await fetch(`https://api.mercadolibre.com/users/${seller_id}/items/search`, {
          headers: { Authorization: `Bearer ${access_token}` }
      });

      if (searchRes.status === 401) {
          res.status(401).json({ ok: false, error: "Token expirado. Reconecte o Mercado Livre." });
          return;
      }

      if (!searchRes.ok) {
          const errText = await searchRes.text();
          console.error("ML_PRODUCTS_SYNC_ERROR", searchRes.status, errText);
          res.status(500).json({ ok: false, error: "Erro ao buscar produtos do Mercado Livre" });
          return;
      }

      const searchData: any = await searchRes.json();
      const itemIds: string[] = searchData.results || [];

      console.log("ML_PRODUCTS_ITEM_IDS_FOUND", { count: itemIds.length });

      if (itemIds.length === 0) {
          res.status(200).json({ ok: true, count: 0 });
          return;
      }

      function removeUndefinedDeep(obj: any): any {
        if (Array.isArray(obj)) {
          return obj.map(removeUndefinedDeep).filter((v) => v !== undefined);
        }
        if (obj && typeof obj === "object") {
          return Object.fromEntries(
            Object.entries(obj)
              .filter(([_, value]) => value !== undefined)
              .map(([key, value]) => [key, removeUndefinedDeep(value)])
          );
        }
        return obj;
      }

      let syncCount = 0;
      
      for (let i = 0; i < itemIds.length; i += 20) {
          const batchIds = itemIds.slice(i, i + 20);
          const detailsRes = await fetch(`https://api.mercadolibre.com/items?ids=${batchIds.join(',')}`, {
              headers: { Authorization: `Bearer ${access_token}` }
          });

          if (detailsRes.ok) {
              const detailsData: any = await detailsRes.json();
              
              for (const itemWrapper of detailsData) {
                  if (itemWrapper.code === 200 && itemWrapper.body) {
                      const item = itemWrapper.body;
                      const productId = item.id;
                      
                      const priceNum = Number(item.price);
                      const oldPriceNum = item.original_price ? Number(item.original_price) : null;
                      const discountStr = oldPriceNum && oldPriceNum > priceNum ? Math.round((1 - priceNum / oldPriceNum) * 100) + '%' : null;
                      
                      const productData = removeUndefinedDeep({
                          product_id: item.id,
                          product_title: item.title,
                          product_price: priceNum,
                          product_old_price: oldPriceNum,
                          product_discount: discountStr,
                          product_image: item.thumbnail ? item.thumbnail.replace('-I.jpg', '-O.jpg') : null,
                          product_link: item.permalink,
                          product_affiliate_link: '',
                          user_id: integration.user_id || null,
                          status: item.status,
                          available_quantity: item.available_quantity,
                          last_synced_at: new Date().toISOString(),
                      });

                      await db.collection("affiliate_products").doc(String(productId)).set(productData, { merge: true });

                      syncCount++;
                  }
              }
          } else {
               console.error("ML_PRODUCTS_SYNC_ERROR batch fetch failed", batchIds);
          }
      }

      console.log("ML_PRODUCTS_SAVE_SUCCESS", { count: syncCount });
      res.status(200).json({ ok: true, count: syncCount });
    } catch (error: any) {
      if (error?.code === 5 || (error?.message && error.message.includes('NOT_FOUND'))) {
          res.status(200).json({ ok: false, error: "not_connected" });
          return;
      }
      console.error("ML_PRODUCTS_SYNC_ERROR", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/mercadolivre/products", async (req, res) => {
    try {
      const userId = req.query.userId;
      const hasFirebaseServiceAccountKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      const admin = await import("firebase-admin");

      if (!admin.apps.length) {
        if (!hasFirebaseServiceAccountKey) {
          res.status(500).json({ ok: false, error: "Firebase Admin not initialized" });
          return;
        }

        let serviceAccount: any = null;
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
        } catch (error: any) {
          res.status(500).json({ ok: false, error: "Invalid service account JSON" });
          return;
        }

        try {
          if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
          }
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        } catch (error: any) {
           res.status(500).json({ ok: false, error: "Failed to initialize Firebase Admin" });
           return;
        }
      }

      const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";

      const { getFirestore } = await import("firebase-admin/firestore");
      let db;
      try {
          db = getFirestore(admin.app(), databaseId);
      } catch (e) {
          db = admin.firestore();
          try {
              db.settings({ databaseId });
          } catch (err) {}
      }
      try { db.settings({ ignoreUndefinedProperties: true }); } catch (e) {}

      let query = db.collection("affiliate_products") as any;
      
      if (userId) {
         query = query.where("user_id", "==", userId);
      }

      const qs = await query.get();
      
      const products = qs.docs.map((doc: any) => {
          const data = doc.data();
          return {
              id: doc.id,
              ...data,
              // ensure we expose the expected interface even if older data was stored
              product_title: data.product_title || data.title,
              product_price: data.product_price || data.price,
              product_image: data.product_image || (data.thumbnail ? data.thumbnail.replace('-I.jpg', '-O.jpg') : null),
              product_link: data.product_link || data.permalink,
          };
      });

      // Sort in memory to avoid needing composite index
      products.sort((a: any, b: any) => {
         const timeA = new Date(a.last_synced_at || 0).getTime();
         const timeB = new Date(b.last_synced_at || 0).getTime();
         return timeB - timeA;
      });

      res.status(200).json({ ok: true, products });

    } catch (error: any) {
      if (error?.code === 5 || (error?.message && error.message.includes('NOT_FOUND'))) {
        res.status(200).json({ ok: true, products: [] });
        return;
      }
      console.error("ML_PRODUCTS_LIST_ERROR", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/mercadolivre/affiliate-products/search", async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q) {
        res.status(400).json({ ok: false, error: "missing_query" });
        return;
      }
      
      console.log("ML_AFFILIATE_SEARCH_ROUTE_HIT", { q });
      
      const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=50`);

      console.log("ML_AFFILIATE_SEARCH_ML_RESPONSE", {
        status: mlRes.status,
        ok: mlRes.ok
      });
      
      if (!mlRes.ok) {
        const details = await mlRes.text().catch(() => "could not read response text");
        res.status(mlRes.status).json({
          ok: false,
          error: "mercadolivre_search_failed",
          status: mlRes.status,
          details
        });
        return;
      }
      
      const mlData: any = await mlRes.json();
      const items = (mlData.results || []).map((item: any) => {
          const priceNum = Number(item.price);
          const oldPriceNum = item.original_price ? Number(item.original_price) : null;
          const discountStr = oldPriceNum && oldPriceNum > priceNum ? Math.round((1 - priceNum / oldPriceNum) * 100) + '%' : null;
          return {
              product_id: item.id,
              title: item.title,
              price: priceNum,
              old_price: oldPriceNum,
              discount: discountStr,
              currency_id: item.currency_id,
              image: item.thumbnail ? item.thumbnail.replace('-I.jpg', '-O.jpg') : null,
              thumbnail: item.thumbnail,
              product_link: item.permalink,
              seller_id: item.seller?.id,
              seller_name: item.seller?.nickname,
              category_id: item.category_id,
              condition: item.condition,
              available_quantity: item.available_quantity
          };
      });
      res.status(200).json({
        ok: true,
        query: q,
        count: items.length,
        products: items
      });
    } catch (error: any) {
      console.error("ML_AFFILIATE_SEARCH_EXCEPTION", error);
      res.status(500).json({
        ok: false,
        error: "search_exception",
        message: error.message || String(error)
      });
    }
  });

  app.get("/api/mercadolivre/affiliate-products/test", (req, res) => {
    res.status(200).json({
      ok: true,
      message: "Rota de produtos afiliados funcionando"
    });
  });

  app.post("/api/mercadolivre/products/save", async (req, res) => {
    try {
      console.log("ML_PRODUCTS_SAVE_MANUAL");
      const { userId, product } = req.body;
      if (!userId || !product || !product.product_id) {
        res.status(400).json({ ok: false, error: "Faltam dados obrigatórios" });
        return;
      }

      const hasFirebaseServiceAccountKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      const admin = await import("firebase-admin");

      if (!admin.apps.length) {
        if (!hasFirebaseServiceAccountKey) {
          res.status(500).json({ ok: false, error: "Firebase Admin not initialized" });
          return;
        }

        let serviceAccount: any = null;
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
        } catch (error: any) {
          res.status(500).json({ ok: false, error: "Invalid service account JSON" });
          return;
        }

        try {
          if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
          }
          admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        } catch (error: any) {
           res.status(500).json({ ok: false, error: "Failed to initialize Firebase Admin" });
           return;
        }
      }

      const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
      const { getFirestore } = await import("firebase-admin/firestore");
      let db;
      try {
          db = getFirestore(admin.app(), databaseId);
      } catch (e) {
          db = admin.firestore();
          try { db.settings({ databaseId }); } catch (err) {}
      }
      try { db.settings({ ignoreUndefinedProperties: true }); } catch (e) {}

      function removeUndefinedDeep(obj: any): any {
        if (Array.isArray(obj)) return obj.map(removeUndefinedDeep).filter((v) => v !== undefined);
        if (obj && typeof obj === "object") {
          return Object.fromEntries(
            Object.entries(obj)
              .filter(([_, value]) => value !== undefined)
              .map(([key, value]) => [key, removeUndefinedDeep(value)])
          );
        }
        return obj;
      }

      const productData = removeUndefinedDeep({
          ...product,
          user_id: userId,
          last_synced_at: new Date().toISOString()
      });

      await db.collection("affiliate_products").doc(String(product.product_id)).set(productData, { merge: true });
      res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error("ML_PRODUCTS_SAVE_MANUAL_ERROR", error);
      res.status(500).json({ ok: false, error: error.message });
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
