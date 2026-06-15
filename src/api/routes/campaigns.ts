import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin.js";
import { getRandomKeyword, CAMPAIGN_CATEGORIES, getNextProductForCampaign, recordProductSent, resolveProductLinkForSending } from "../campaignService.js";
import { GoogleGenAI } from "@google/genai";
import { simplifyProductTitle } from "../../lib/productUtils.js";

const router = Router();

// Lazy initialize AI
let genAI: any = null;
function getAI() {
  if (!genAI) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY não configurada no servidor.");
    genAI = new GoogleGenAI({ apiKey: key });
  }
  return genAI;
}

// Utility to fetch products from ML directly
async function fetchMLProductsByKeyword(keyword: string): Promise<any[]> {
    const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(keyword)}&limit=50`);
    if (!mlRes.ok) return [];
    const data = await mlRes.json();
    return data.results || [];
}

router.post("/prepare-message", async (req, res) => {
  const { campaignId, category, marketplace, userId, template, tone, messageMode, excludeProductIds = [] } = req.body;

  try {
    const db = await getAdminDb();

    // Safety Validation: Check if the chosen marketplace is connected
    console.log("AUTO_OFFER_STATUS_CHECK", { userId });
    const keysSnapshot = await db.collection("ecommerce_keys")
      .where("user_id", "==", userId)
      .get();

    const connectedPlatforms = new Set();
    // mercadolivre_global is ALWAYS allowed
    connectedPlatforms.add('mercadolivre_global');

    keysSnapshot.forEach(doc => {
      const data = doc.data();
      const st = data.status || data.conected || data.connected;
      if (st === 'connected' || st === 'active' || st === true) {
          const plat = data.platform;
          connectedPlatforms.add(plat);
          if (plat === 'mercadolivre_manual' || plat === 'mercado_livre' || plat === 'Mercado Livre') {
            connectedPlatforms.add('mercadolivre');
          }
      }
    });

    const mlDocSnap = await db.doc(`users/${userId}/integrations/mercadolivre`).get();
    if (mlDocSnap.exists) {
      const mlData = mlDocSnap.data();
      if (mlData && mlData.connected === true) {
        connectedPlatforms.add('mercadolivre');
      }
    }
    console.log("AUTO_OFFER_STATUS_RESULT", { platforms: Array.from(connectedPlatforms) });

    let finalMessage = template;
    let finalImage = "";
    let productId = null;

    if (messageMode === 'auto_offer') {
      console.log("CAMPAIGN_MODE_AUTO_OFFER");
      if (connectedPlatforms.size === 0) {
        return res.status(400).json({ 
          ok: false, 
          step: "validate_marketplace",
          error: 'Conecte pelo menos um marketplace em Integrações para usar ofertas automáticas.' 
        });
      }

      if (marketplace !== 'all' && !connectedPlatforms.has(marketplace)) {
        return res.status(400).json({ 
          ok: false, 
          step: "validate_marketplace",
          error: 'Este marketplace não está conectado em Integrações.' 
        });
      }

      const mpToQuery = marketplace === 'mercadolivre_global' ? 'mercadolivre' : marketplace;
      const product = await getNextProductForCampaign(db, campaignId, category, mpToQuery, excludeProductIds, Array.from(connectedPlatforms) as string[]);
      
      if (!product) {
        return res.status(200).json({ ok: false, noMoreProducts: true });
      }

      console.log("AUTO_OFFER_SELECTED", { id: product.id, name: product.product_name });

      // Lenient validation: if product marketplace is not in connectedPlatforms, we still proceed but without affiliate link
      if (!connectedPlatforms.has(product.marketplace)) {
         console.warn("PRODUCT_MARKETPLACE_NOT_CONNECTED", { productMarketplace: product.marketplace });
      }

      const originalUrl = product.productUrl || product.url || product.permalink || product.product_original_link || product.affiliateUrl || '';
      product.product_link = originalUrl;
      product.product_affiliate_link = originalUrl;
      product.affiliateUrl = originalUrl;
      
      console.log("SEND_NOW_PRODUCT_SELECTED", { id: product.id, title: product.product_name || product.title, finalLink: originalUrl, campaignId });

      productId = product.id;
      finalImage = product.product_image;

      
      // Render message using shared utility
      const { renderOfferMessage } = await import('../../utils/messageFormatter.js');
      finalMessage = renderOfferMessage(template, product);

      console.log("SEND_NOW_RENDERED_MESSAGE", finalMessage);
    } else {
      // Legacy variables fallback
      finalMessage = finalMessage.replace(/{{[^{}]+}}/g, '');
    }

    const { validateCampaignLinksBeforeSending, replaceOriginalLinksWithAffiliateLinks } = await import('../../lib/affiliate/affiliate-resolver.js');
    
    const validationResult = await validateCampaignLinksBeforeSending(finalMessage, userId, campaignId);
    
    if (!validationResult.canSend) {
      return res.status(200).json({
        ok: false,
        canSend: false,
        reasons: validationResult.reasons
      });
    }
    
    finalMessage = replaceOriginalLinksWithAffiliateLinks(finalMessage, validationResult.resolvedLinks);

    res.status(200).json({ 
      ok: true, 
      canSend: true,
      resolvedLinks: validationResult.resolvedLinks,
      message: finalMessage, 
      imageUrl: finalImage,
      productId 
    });
  } catch (error: any) {
    console.error("ERRO_PREPARE_MESSAGE", error);
    res.status(500).json({ ok: false, error: error.message, step: "prepare_message" });
  }
});

router.post("/mark-sent", async (req, res) => {
  const { campaignId, productId, userId } = req.body;
  try {
    const db = await getAdminDb();
    await recordProductSent(db, campaignId, productId, userId);
    res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('Error marking product as sent:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/:id/preview-offer", async (req, res) => {
    try {
        const { category, marketplace, userId } = req.query;
        const db = await getAdminDb();
        
        let query = db.collection('offer_bank').where('status', '==', 'active');
        
        const cat = typeof category === 'string' ? category : 'Todos';
        if (cat && cat !== 'Todos') {
            query = query.where('category', '==', cat);
        }
        
        const mpOrig = typeof marketplace === 'string' ? marketplace : 'all';
        const mp = mpOrig === 'mercadolivre_global' ? 'mercadolivre' : mpOrig;
        
        if (mp && mp !== 'all') {
            query = query.where('marketplace', '==', mp);
        }
        
        const snapshot = await query.limit(5).get();
        
        if (snapshot.empty) {
            res.status(404).json({ error: "Nenhum produto encontrado no Banco de Ofertas para este filtro." });
            return;
        }
        
        // Sort docs in memory by updatedAt descending
        const sortedDocs = [...snapshot.docs].sort((a: any, b: any) => {
            const timeA = a.data().updatedAt?.toDate?.()?.getTime() || a.data().updatedAt || 0;
            const timeB = b.data().updatedAt?.toDate?.()?.getTime() || b.data().updatedAt || 0;
            return timeB - timeA;
        });
        
        const doc = sortedDocs[0];
        const data = doc.data();
        
        // Use the resolution logic for preview as well
        const prodData = { ...data, id: doc.id };
        const campaignId = req.params.id;
        
        let finalProductLink = data.affiliateUrl || data.productUrl || '';
        let affiliatePending = false;
        
        if (typeof userId === 'string') {
            const { resolveAffiliateLinkForSending } = await import('../../lib/affiliate/affiliate-resolver.js');
            const result = await resolveAffiliateLinkForSending({
                originalUrl: prodData.productUrl || finalProductLink,
                provider: prodData.marketplace || 'unknown',
                userId,
                campaignId
            });
            if (result.canSend && result.finalUrl !== result.originalUrl) {
                finalProductLink = result.finalUrl;
            } else if (!result.canSend) {
                finalProductLink = result.originalUrl;
                affiliatePending = true;
            } else {
                finalProductLink = result.finalUrl;
            }
        }
        
        const product = {
            id: doc.id,
            external_product_id: data.productId || doc.id,
            product_title: data.titleShort || data.title,
            titleOriginal: data.titleOriginal || data.title,
            titleShort: data.titleShort || data.title,
            product_price: data.price,
            product_old_price: data.originalPrice,
            product_discount: data.discountPercent ? `${data.discountPercent}% OFF` : null,
            discountPercent: data.discountPercent,
            product_link: finalProductLink,
            product_affiliate_link: finalProductLink,
            affiliateUrl: finalProductLink,
            affiliatePending,
            product_original_link: data.productUrl,
            product_image: data.imageUrl,
            product_category: data.category,
            category: data.category,
            marketplace: data.marketplace,
            product_coupon: data.couponCode || data.cupom || '',
        };

        res.json({ product });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.post("/:id/generate-copy", async (req, res) => {
    try {
        const { category, product, tone, template } = req.body;
        
        const prompt = `Atue como um copywriter profissional de alta conversão. Você deve gerar o texto de uma oferta para WhatsApp seguindo a exata estrutura do template fornecido pelo usuário.
        
Seu objetivo é gerar o TEXTO, mantendo as VARIÁVEIS (ex: {product_link}, {product_price}, etc.) no texto para que o sistema as substitua depois, OU substituí-las se preferir, mas como é para gerar um TEMPLATE ou TEXTO para o cliente aprovar, você deve retornar um texto com cara de WhatsApp usando os dados do produto se o usuário solicitou isso, ou manter as variáveis.
O usuário quer gerar a copy JÁ COM OS DADOS do produto para preview, ou um template melhor. 

Na instrução: A IA não deve inventar preço, estoque etc.

DADOS DA MENSAGEM:
Categoria: ${category}
Tom da Copy: ${tone}
Produto de Exemplo (se aplicável): ${product?.product_title || 'Nenhum'}
Preço Real: ${product?.product_price || 'Nenhum'}

ESTRUTURA DESEJADA PELO USUÁRIO:
${template || 'Nenhum'}

INSTRUÇÕES:
- Melhore a copy, deixando mais persuasiva de acordo com o Tom.
- Se o usuário forneceu um produto, use os dados reais do produto no lugar das variáveis no resultado! Ou seja, insira o título, preço, link dele.
- Se tiver um link, insira-o.
- Seja curto, use emojis, parágrafos curtos.
- NÃO invente descontos ou estoques se não existir.

Retorne APENAS o texto da mensagem final. Sem tags markdown block de código, sem comentários.`;

        const aiClient = getAI();
        const response = await aiClient.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: prompt
        });

        const copy = response.text;
        res.json({ copy });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.get("/categories", (req, res) => {
    res.json(Object.keys(CAMPAIGN_CATEGORIES));
});

router.post("/trigger-tick", async (req, res) => {
  try {
    const db = getAdminDb();
    
    // Import dynamically to avoid ESM import/export order issues
    const { checkAndTriggerCampaigns } = await import("../../../campaignScheduler.js");
    const { processPendingSendJobs } = await import("../../../src/workers/campaign-send-worker.js");
    
    console.log("[Campaign Route] Triggering on-demand scheduler check...");
    await checkAndTriggerCampaigns(db);
    
    console.log("[Campaign Route] Triggering on-demand worker send queue processing...");
    await processPendingSendJobs(db);
    
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[Campaign Route] Error in trigger-tick:", e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

router.get("/debug-trigger", async (req, res) => {
  try {
    const db = getAdminDb();
    
    // Get Firebase app details
    const { getFirebaseAdminApp } = await import("../firebaseAdmin.js");
    const app = getFirebaseAdminApp();
    const appOptions = app?.options || {};
    
    const campaignsRef = db.collection('campaigns');
    const snapshot = await campaignsRef
      .where('trigger_type', 'in', ['scheduled', 'auto'])
      .where('status', '==', 'scheduled')
      .get();
      
    const results = [];
    for (const doc of snapshot.docs) {
      const camp = doc.data();
      const lastRun = camp.last_run?.toDate?.() || new Date(0);
      const now = new Date();
      const diffMs = now.getTime() - lastRun.getTime();
      
      let triggered = false;
      let reason = "";
      
      if (camp.trigger_type === 'auto') {
          if (camp.auto_send_now && camp.send_interval) {
             const parts = camp.send_interval.split(':');
             const m = parseInt(parts[0], 10) || 0;
             const s = parseInt(parts[1], 10) || 0;
             const intervalMs = (m * 60 + s) * 1000;
             
             if (diffMs >= intervalMs && intervalMs > 0) {
               triggered = true;
               reason = "Should trigger";
             } else {
               reason = `Interval not met: diffMs=${diffMs}, intervalMs=${intervalMs}`;
             }
          } else {
             reason = `Missing auto_send_now or send_interval`;
          }
      } else {
         reason = `Not auto campaign`;
      }
      
      results.push({
        id: doc.id,
        name: camp.name,
        trigger_type: camp.trigger_type,
        status: camp.status,
        last_run: lastRun.toISOString(),
        now: now.toISOString(),
        diffMs,
        triggered,
        reason
      });
    }
    
    res.json({
      ok: true,
      firebaseConfig: {
        projectId: appOptions.projectId || null,
        hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        databaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
        envKeys: Object.keys(process.env).filter(k => k.includes("FIREBASE") || k.includes("GOOGLE") || k.includes("FIRESTORE"))
      },
      campaignsFound: snapshot.size,
      results
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

export default router;
