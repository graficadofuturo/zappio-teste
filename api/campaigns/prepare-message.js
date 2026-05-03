import { getNextProductForCampaign, recordProductSent } from './helpers';
import { getAdminDb } from '../../lib/firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { campaignId, category, marketplace, userId, template, tone, messageMode } = req.body;

  try {
    const adminDb = getAdminDb();

    // Safety Validation: Check if the chosen marketplace is connected
    const keysSnapshot = await adminDb.collection("ecommerce_keys")
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

      const product = await getNextProductForCampaign(campaignId, category, marketplace, userId);
      
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
      const price = `*R$ ${Number(product.product_price).toFixed(2).replace('.', ',')}*`;
      const oldPrice = product.product_old_price ? `~R$ ${Number(product.product_old_price).toFixed(2).replace('.', ',')}~` : "";
      const discount = product.product_discount || "";
      const link = product.product_affiliate_link || product.product_original_link;
      const marketplace = product.marketplace || "Mercado Livre";

      // If there's no template, use a default one based on tone
      if (!template || template.trim() === "") {
        finalMessage = `🚀 *OFERTA DO DIA* 🚀\n\n` +
                       `📦 *${product.product_name}*\n` +
                       `${oldPrice ? `De: ${oldPrice}\n` : ""}` +
                       `Por apenas: ${price}\n` +
                       `${discount ? `Economia de: ${discount}\n` : ""}` +
                       `🛒 *Compre aqui:* ${link}\n\n` +
                       `Enviado via ${marketplace}`;
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
          .replace(/{marketplace}/g, marketplace);
      }
    }

    return res.status(200).json({ 
      ok: true, 
      message: finalMessage, 
      imageUrl: finalImage,
      productId 
    });
  } catch (error) {
    console.error('Error preparing campaign message:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
