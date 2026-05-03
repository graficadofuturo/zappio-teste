import { Router } from "express";
import { getAdminDb } from "../firebaseAdmin.ts";
import { getRandomKeyword, CAMPAIGN_CATEGORIES, getNextProductForCampaign, recordProductSent } from "../campaignService.ts";
import { GoogleGenAI } from "@google/genai";

const router = Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Utility to fetch products from ML directly
async function fetchMLProductsByKeyword(keyword: string): Promise<any[]> {
    const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(keyword)}&limit=50`);
    if (!mlRes.ok) return [];
    const data = await mlRes.json();
    return data.results || [];
}

router.post("/prepare-message", async (req, res) => {
  const { campaignId, category, marketplace, userId, template, tone, messageMode } = req.body;

  try {
    const db = await getAdminDb();

    // Safety Validation: Check if the chosen marketplace is connected
    const keysSnapshot = await db.collection("ecommerce_keys")
      .where("user_id", "==", userId)
      .where("status", "==", "connected")
      .get();

    const connectedPlatforms = new Set();
    keysSnapshot.forEach(doc => connectedPlatforms.add(doc.data().platform));

    let finalMessage = template;
    let finalImage = "";
    let productId = null;

    if (messageMode === 'auto_offer') {
      if (connectedPlatforms.size === 0) {
        return res.status(400).json({ 
          ok: false, 
          code: "NO_MARKETPLACE_CONNECTED", 
          error: 'Conecte pelo menos um marketplace em Integrações para usar ofertas automáticas.' 
        });
      }

      if (marketplace !== 'all' && !connectedPlatforms.has(marketplace)) {
        return res.status(400).json({ 
          ok: false, 
          code: "MARKETPLACE_NOT_CONNECTED", 
          error: 'Este marketplace não está conectado em Integrações.' 
        });
      }

      const product = await getNextProductForCampaign(db, campaignId, category, marketplace);
      
      if (!product) {
        return res.status(200).json({ ok: false, noMoreProducts: true });
      }

      // Final validation: product marketplace MUST be in connectedPlatforms
      if (!connectedPlatforms.has(product.marketplace)) {
         return res.status(400).json({ 
          ok: false, 
          code: "INCONSISTENT_MARKETPLACE", 
          error: 'Ocorreu um erro: Produto selecionado pertence a um marketplace não conectado.' 
        });
      }

      productId = product.id;
      finalImage = product.product_image;

      // Formatting according to rules
      const priceValue = product.product_price || 0;
      const oldPriceValue = product.product_old_price;
      
      const price = `*R$ ${Number(priceValue).toFixed(2).replace('.', ',')}*`;
      const oldPrice = oldPriceValue ? `~R$ ${Number(oldPriceValue).toFixed(2).replace('.', ',')}~` : "";
      const discount = product.product_discount || "";
      const link = product.product_affiliate_link || product.product_original_link;
      const marketplaceName = product.marketplace || "Mercado Livre";

      // If there's no template, use a default one based on tone
      if (!template || template.trim() === "") {
        finalMessage = `🚀 *OFERTA DO DIA* 🚀\n\n` +
                       `📦 *${product.product_name}*\n` +
                       `${oldPrice ? `De: ${oldPrice}\n` : ""}` +
                       `Por apenas: ${price}\n` +
                       `${discount ? `Economia de: ${discount}\n` : ""}` +
                       `🛒 *Compre aqui:* ${link}\n\n` +
                       `Enviado via ${marketplaceName}`;
      } else {
        // Replace variables
        finalMessage = template
          .replace(/{product_title}/g, product.product_name)
          .replace(/{product_price}/g, price)
          .replace(/{product_old_price}/g, oldPrice)
          .replace(/{product_discount}/g, discount)
          .replace(/{product_link}/g, link)
          .replace(/{product_affiliate_link}/g, link)
          .replace(/{product_category}/g, product.category || "")
          .replace(/{marketplace}/g, marketplaceName);
      }
    }

    res.status(200).json({ 
      ok: true, 
      message: finalMessage, 
      imageUrl: finalImage,
      productId 
    });
  } catch (error: any) {
    console.error('Error preparing campaign message:', error);
    res.status(500).json({ ok: false, error: error.message });
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
        const { category } = req.query;
        const cat = typeof category === 'string' ? category : 'Todos';
        const keyword = getRandomKeyword(cat);
        const results = await fetchMLProductsByKeyword(keyword);
        
        if (results.length === 0) {
            res.status(404).json({ error: "Nenhum produto encontrado na categoria especificada." });
            return;
        }
        
        const mlItem = results[Math.floor(Math.random() * results.length)];
        const product = {
            id: mlItem.id,
            external_product_id: mlItem.id,
            product_title: mlItem.title,
            product_price: mlItem.price,
            product_old_price: mlItem.original_price,
            product_discount: mlItem.original_price && mlItem.price < mlItem.original_price ? Math.round((1 - (mlItem.price / mlItem.original_price)) * 100) + '%' : null,
            product_link: mlItem.permalink,
            product_image: mlItem.thumbnail?.replace('-I.jpg', '-O.jpg').replace('-I.webp', '-O.webp') || null,
            product_category: cat
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

        const response = await ai.models.generateContent({
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

export default router;
