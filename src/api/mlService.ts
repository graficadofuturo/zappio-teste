import * as cheerio from 'cheerio';
import { getAdminDb } from './firebaseAdmin.ts';

/**
 * Simplifies long SEO titles from Mercado Livre into a commercial version
 */
export function simplifyProductTitle(title: string): string {
  if (!title || typeof title !== "string") return "Produto";
  if (title.includes("Produto Mercado Livre")) return "Produto";
  
  let short = title
    .replace(/\s+/g, " ")
    .replace(/\b(Smartphone|Smart TV|Smartwatch|Fone de Ouvido|Bluetooth|Original|Novo|Lacrado|Promoção|Oferta|Envio Full|Frete Grátis|Pronta Entrega|NFC|Android|IP67|Gaming Hub|Crystal|UHD|4K UHD)\b/gi, "")
    .replace(/Câmera Tripla[^]*?(?=-|$)/gi, "")
    .replace(/Selfie De[^]*?(?=-|$)/gi, "")
    .replace(/Super Amoled[^]*?(?=-|$)/gi, "")
    .replace(/Recursos AI[^]*?(?=-|$)/gi, "")
    .replace(/Segurança[^]*?(?=-|$)/gi, "")
    .replace(/Snapdragon[^]*?(?=-|$)/gi, "")
    .replace(/\d+GB RAM/gi, "")
    .replace(/Tela[^]*?(?=-|$)/gi, "")
    .replace(/Processador[^]*?(?=-|$)/gi, "")
    .replace(/ 0\.5ms/gi, "")
    .replace(/Basic Microfibra/gi, "")
    .replace(/Sem Costura/gi, "")
    .replace(/\|/g, "-")
    .trim();

  // Remove repeated words
  const words = short.split(/\s+/);
  short = words.filter((word, i) => i === 0 || word.toLowerCase() !== words[i-1].toLowerCase()).join(' ');

  if (short.length > 50) {
    const parts = short.slice(0, 50).split(' ');
    if (parts.length > 1) parts.pop();
    short = parts.join(' ').trim();
    if (short.length > 47) short = short.slice(0, 47);
    short += "...";
  }

  return short || title.slice(0, 47) + "...";
}

/**
 * Normalizes category based on ML data or inference
 */
export function normalizeOfferCategory(rawCategory: string, title: string, searchTerm: string) {
  const source = String(rawCategory || searchTerm || "").toLowerCase();
  const productTitle = String(title || "").toLowerCase();

  if (
    source.includes("tec") ||
    source.includes("eletr") ||
    source.includes("inform") ||
    productTitle.includes("smartphone") ||
    productTitle.includes("celular") ||
    productTitle.includes("iphone") ||
    productTitle.includes("samsung galaxy") ||
    productTitle.includes("noteb") ||
    productTitle.includes("laptop") ||
    productTitle.includes("monit") ||
    productTitle.includes("fone") ||
    productTitle.includes("tv ") ||
    productTitle.includes("smart tv") ||
    productTitle.includes("tablet") ||
    productTitle.includes("processador") ||
    productTitle.includes("placa de vídeo")
  ) return "Tecnologia";

  if (
    source.includes("casa") ||
    source.includes("cozinha") ||
    source.includes("eletrodom") ||
    source.includes("decora") ||
    productTitle.includes("panela") ||
    productTitle.includes("fritadeira") ||
    productTitle.includes("air fryer") ||
    productTitle.includes("cafeteira") ||
    productTitle.includes("sofá") ||
    productTitle.includes("mesa") ||
    productTitle.includes("cadeira") ||
    productTitle.includes("geladeira") ||
    productTitle.includes("fogão") ||
    productTitle.includes("lavadora") ||
    productTitle.includes("máquina de lavar") ||
    productTitle.includes("microondas")
  ) return "Casa e Cozinha";

  if (
    source.includes("beleza") ||
    source.includes("saúde") ||
    source.includes("perfu") ||
    productTitle.includes("perfume") ||
    productTitle.includes("shampoo") ||
    productTitle.includes("secador") ||
    productTitle.includes("chapinha") ||
    productTitle.includes("barbeador") ||
    productTitle.includes("maquiagem") ||
    productTitle.includes("batom")
  ) return "Beleza e Saúde";

  if (
    source.includes("moda") ||
    source.includes("roupa") ||
    source.includes("calcado") ||
    productTitle.includes("camiseta") ||
    productTitle.includes("camisa") ||
    productTitle.includes("tenis") ||
    productTitle.includes("tênis") ||
    productTitle.includes("calça") ||
    productTitle.includes("bolsa") ||
    productTitle.includes("vestido") ||
    productTitle.includes("mochila") ||
    productTitle.includes("boné")
  ) return "Moda";

  if (
    source.includes("ferramenta") ||
    productTitle.includes("furadeira") ||
    productTitle.includes("parafusadeira") ||
    productTitle.includes("serra") ||
    productTitle.includes("martelo") ||
    productTitle.includes("chave de fenda") ||
    productTitle.includes("esmerilhadeira")
  ) return "Ferramentas";

  if (
    source.includes("auto") ||
    source.includes("carro") ||
    productTitle.includes("pneu") ||
    productTitle.includes("capacete") ||
    productTitle.includes("óleo motor") ||
    productTitle.includes("palheta") ||
    productTitle.includes("bateria automotiva") ||
    productTitle.includes("som automotivo") ||
    productTitle.includes("multimídia")
  ) return "Automotivo";

  if (
    source.includes("brinquedo") ||
    source.includes("infantil") ||
    productTitle.includes("boneca") ||
    productTitle.includes("lego") ||
    productTitle.includes("carrinho") ||
    productTitle.includes("jogo") ||
    productTitle.includes("quebra-cabeça")
  ) return "Brinquedos";

  if (
    source.includes("esporte") ||
    source.includes("fitness") ||
    productTitle.includes("whey") ||
    productTitle.includes("creatina") ||
    productTitle.includes("suplemento") ||
    productTitle.includes("bicicleta") ||
    productTitle.includes("bola")
  ) return "Esporte e Fitness";

  return "Geral";
}

/**
 * Standardize and VALIDATE an offer payload for Firestore
 */
export function normalizeOffer(item: any, source = 'auto_collector', category = 'todos', searchTerm = '') {
  const originalPrice = Number(item.original_price ?? item.originalPrice ?? null);
  const price = Number(item.price ?? null);
  
  if (!item.title || item.title.includes("Produto Mercado Livre") || item.title.length < 5) return null;
  if (!Number.isFinite(price) || price <= 0) return null;

  const productId = String(item.id || item.marketplaceProductId || item.productId);
  if (!productId || productId.startsWith("url_")) return null;

  const productUrl = item.permalink || item.productUrl || null;
  if (!productUrl || !productUrl.startsWith("http")) return null;

  const thumbnail = item.thumbnail || item.image || item.imageUrl || null;
  if (!thumbnail) return null;

  const imageUrl = thumbnail.replace("-I.jpg", "-O.jpg");

  let discountPercent = null;
  if (originalPrice && price && originalPrice > price) {
    discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  let fullTitle = item.title.trim();
  const half = Math.floor(fullTitle.length / 2);
  if (fullTitle.length > 20 && fullTitle.slice(0, half) === fullTitle.slice(half)) {
    fullTitle = fullTitle.slice(0, half).trim();
  }

  const shortTitle = simplifyProductTitle(fullTitle);

  // Determine Category
  const finalCategory = normalizeOfferCategory(category, fullTitle, searchTerm);

  const offer = {
    marketplace: "mercadolivre",
    productId: productId,
    title: shortTitle,
    titleShort: shortTitle,
    titleOriginal: fullTitle,
    price: price,
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : null,
    discountPercent: item.discountPercent ?? discountPercent,
    imageUrl: imageUrl,
    productUrl: productUrl,
    affiliateUrl: item.affiliateUrl || null,
    category: finalCategory, 
    status: "active",
    source: source,
    collectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return offer;
}

export async function collectAutomatedFromML(query: string, category = 'todos') {
  const enrichedOffers: any[] = [];
  const urls = [
    `https://www.mercadolivre.com.br/ofertas?q=${encodeURIComponent(query)}`,
    `https://lista.mercadolivre.com.br/${encodeURIComponent(query.replace(/\s+/g, '-'))}`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36" }
      });
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        
        $('.ui-search-result, .promotion-item, [class*="poly-card"]').each((_, el) => {
          const title = $(el).find('h2, h3, [class*="title"]').text().trim();
          const productUrl = $(el).find('a').first().attr('href');
          const imageUrl = $(el).find('img').first().attr('data-src') || $(el).find('img').first().attr('src');
          const priceText = $(el).find('.andes-money-amount__fraction, .price-tag-fraction').first().text().replace(/\./g, '');
          const price = parseFloat(priceText);
          
          if (title && price > 0 && productUrl && imageUrl) {
            const idMatch = productUrl.match(/MLB-?(\d+)/);
            const productId = idMatch ? `MLB${idMatch[1]}` : null;
            
            if (productId) {
                const offer = normalizeOffer({
                    id: productId,
                    title,
                    price,
                    permalink: productUrl,
                    thumbnail: imageUrl
                }, "monolith_collector", category, query);
                
                if (offer) enrichedOffers.push(offer);
            }
          }
        });
      }
    } catch (e) {
      console.error(`ML_COLLECT_ERR: ${url}`, e);
    }
    if (enrichedOffers.length >= 20) break;
  }
  return enrichedOffers;
}

export async function saveToOfferBank(offers: any[]) {
    if (!offers.length) return 0;
    const db = getAdminDb();
    const batch = db.batch();
    for (const offer of offers) {
        const docRef = db.collection("affiliate_offers").doc(`ml_${offer.productId}`);
        batch.set(docRef, offer, { merge: true });
    }
    await batch.commit();
    return offers.length;
}
