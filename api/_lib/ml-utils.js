import * as cheerio from 'cheerio';
import { getAdminDb } from './firebase-admin.js';

/**
 * Simplifies long SEO titles from Mercado Livre into a commercial version
 */
export function simplifyProductTitle(title) {
  if (!title) return "";
  
  let short = title
    .replace(/Smartphone /gi, "")
    .replace(/Smart TV /gi, "Smart TV ")
    .replace(/Fone de Ouvido /gi, "")
    .replace(/Bluetooth /gi, "")
    .replace(/Câmera Tripla[^]*?(?=-|$)/gi, "")
    .replace(/Selfie De[^]*?(?=-|$)/gi, "")
    .replace(/Super Amoled[^]*?(?=-|$)/gi, "")
    .replace(/Recursos Ai[^]*?(?=-|$)/gi, "")
    .replace(/Segurança[^]*?(?=-|$)/gi, "")
    .replace(/Snapdragon[^]*?(?=-|$)/gi, "")
    .replace(/NFC/gi, "")
    .replace(/Android/gi, "")
    .replace(/Lacrado/gi, "")
    .replace(/Novo/gi, "")
    .replace(/Original/gi, "")
    .replace(/IP67/gi, "")
    .replace(/\d+GB RAM/gi, "")
    .replace(/Tela[^]*?(?=-|$)/gi, "")
    .replace(/Processador[^]*?(?=-|$)/gi, "")
    .replace(/Gaming Hub/gi, "")
    .replace(/Crystal/gi, "")
    .replace(/UHD/gi, "")
    .replace(/4K/gi, "4K")
    .replace(/ 0\.5ms/gi, "")
    .replace(/Basic Microfibra/gi, "")
    .replace(/Sem Costura/gi, "")
    .trim();

  // Remove repeated words (common in ML titles)
  const words = short.split(/\s+/);
  short = words.filter((word, i) => i === 0 || word.toLowerCase() !== words[i-1].toLowerCase()).join(' ');

  // Limit to 55 chars
  if (short.length > 55) {
    short = short.slice(0, 52) + "...";
  }

  return short || title.slice(0, 55);
}

/**
 * Standardize and VALIDATE an offer payload for Firestore
 * Returns null if the offer is invalid.
 */
export function normalizeOffer(item, source = 'auto_collector', category = 'todos', searchTerm = '') {
  const originalPrice = Number(item.original_price ?? item.originalPrice ?? null);
  const price = Number(item.price ?? null);
  
  // REQUIRED FIELDS VALIDATION
  if (!item.title || item.title.includes("Produto Mercado Livre") || item.title.length < 5) {
     return null;
  }
  
  if (!Number.isFinite(price) || price <= 0) {
     return null;
  }

  const productId = String(item.id || item.marketplaceProductId || item.productId);
  if (!productId || productId.startsWith("url_")) {
     return null;
  }

  const productUrl = item.permalink || item.productUrl || null;
  if (!productUrl || !productUrl.startsWith("http")) {
     return null;
  }

  const thumbnail = item.thumbnail || item.image || item.imageUrl || null;
  if (!thumbnail) {
     return null;
  }

  // Use higher resolution if possible
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

  // Ensure price logic is sound: price should be the final effective price
  let finalPrice = price;
  let finalOriginalPrice = originalPrice;

  if (finalOriginalPrice && finalPrice > finalOriginalPrice) {
    // If somehow they are swapped, swap them back
    [finalPrice, finalOriginalPrice] = [finalOriginalPrice, finalPrice];
  }

  // Ensure originalPrice is null if it's not greater than current price
  if (finalOriginalPrice !== null && finalOriginalPrice <= finalPrice) {
    finalOriginalPrice = null;
  }

  const hasDiscount = !!(finalOriginalPrice && finalOriginalPrice > finalPrice);
  const discountPercentage = hasDiscount ? (discountPercent || Math.round(((finalOriginalPrice - finalPrice) / finalOriginalPrice) * 100)) : null;

  // DEBUG LOG AS REQUESTED
  console.log("PRICE_DEBUG", {
    title: shortTitle,
    rawPrice: price,
    rawOriginalPrice: originalPrice,
    selectedPrice: finalPrice,
    selectedOriginalPrice: finalOriginalPrice,
    hasDiscount,
    discountPercentage,
    sourceUrl: item.permalink || 'unknown'
  });

  const offer = {
    marketplace: "mercadolivre",
    productId: productId,
    title: shortTitle, // Default for compatibility
    titleShort: shortTitle,
    titleOriginal: fullTitle,
    price: finalPrice,
    originalPrice: Number.isFinite(finalOriginalPrice) ? finalOriginalPrice : null,
    hasDiscount: hasDiscount,
    discountPercentage: discountPercentage,
    discountPercent: discountPercentage ? `${discountPercentage}% OFF` : null, // legacy compat
    imageUrl: imageUrl,
    productUrl: productUrl,
    affiliateUrl: item.affiliateUrl || null,
    category: finalCategory,
    status: "active",
    source: source,
    collectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Final check: filter out undefined/null except for allowed nulls
  return Object.fromEntries(
    Object.entries(offer).filter(([k, v]) => {
      if (k === 'originalPrice' || k === 'discountPercent' || k === 'affiliateUrl' || k === 'category') return true;
      return v !== undefined && v !== null;
    })
  );
}

/**
 * Normalizes category based on ML data or inference
 */
export function normalizeOfferCategory(rawCategory, title, searchTerm) {
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
 * Scrape a single product page for real data with robust enrichment
 */
export async function scrapeProductPage(idOrUrl, category = 'todos') {
  const url = idOrUrl.startsWith('http') ? idOrUrl : `https://www.mercadolivre.com.br/p/${idOrUrl}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9"
      }
    });
    
    if (!res.ok) return null;
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Extract using meta tags (very reliable)
    const title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
    const imageUrl = $('meta[property="og:image"]').attr('content');
    
    // EXTRACT PRICES ROBUSTLY
    let price = 0;
    let originalPrice = null;
    let discountText = "";

    // 1. Current Price Candidates
    const currentPriceCandidates = [];
    
    // Meta tag
    const metaPrice = $('meta[property="product:price:amount"]').attr('content');
    if (metaPrice) currentPriceCandidates.push(parseFloat(metaPrice));

    // Page selectors for current price
    $('.ui-pdp-price__second-line .andes-money-amount, .ui-pdp-price__current-price .andes-money-amount').first().each((i, el) => {
      const fraction = $(el).find('.andes-money-amount__fraction').text().replace(/\./g, '');
      const cents = $(el).find('.andes-money-amount__cents').text() || '00';
      const val = parseFloat(`${fraction}.${cents}`);
      if (val > 0) currentPriceCandidates.push(val);
    });

    // 2. Previous Price Candidates
    const previousPriceCandidates = [];
    $('.ui-pdp-price__original-value .andes-money-amount, .andes-money-amount--previous, del .andes-money-amount').each((i, el) => {
      const fraction = $(el).find('.andes-money-amount__fraction').text().replace(/\./g, '');
      const cents = $(el).find('.andes-money-amount__cents').text() || '00';
      const val = parseFloat(`${fraction}.${cents}`);
      if (val > 0) previousPriceCandidates.push(val);
    });

    // 3. Discount text
    discountText = $('.ui-pdp-price__discount, [class*="discount"]').first().text().trim();
    let discountPercentageFromPage = null;
    const discMatch = discountText.match(/(\d+)%\s*OFF/i);
    if (discMatch) discountPercentageFromPage = parseInt(discMatch[1]);

    const allFoundPrices = [...currentPriceCandidates, ...previousPriceCandidates].filter(v => v > 0);
    const uniquePrices = [...new Set(allFoundPrices)].sort((a, b) => a - b);

    let selectedPrice = 0;
    let selectedOriginalPrice = null;

    if (uniquePrices.length >= 2) {
      selectedPrice = uniquePrices[0];
      selectedOriginalPrice = uniquePrices[uniquePrices.length - 1];
    } else if (uniquePrices.length === 1) {
      selectedPrice = uniquePrices[0];
      selectedOriginalPrice = null;
    }

    // Refine: if we have explicit "previous" price, use it
    if (previousPriceCandidates.length > 0) {
      const highestOld = Math.max(...previousPriceCandidates);
      if (highestOld > selectedPrice) {
        selectedOriginalPrice = highestOld;
      }
    }

    if (selectedOriginalPrice && selectedPrice >= selectedOriginalPrice) {
       selectedOriginalPrice = null;
    }

    let finalDiscountPercent = discountPercentageFromPage;
    if (selectedOriginalPrice && !finalDiscountPercent) {
       finalDiscountPercent = Math.round(((selectedOriginalPrice - selectedPrice) / selectedOriginalPrice) * 100);
    }

    // DEBUG LOG AS REQUESTED
    console.log("ML_PRODUCT_PRICE_DEBUG", {
      url,
      title,
      pricesFound: uniquePrices,
      previousPriceCandidates,
      currentPriceCandidates,
      selectedPrice,
      selectedOriginalPrice,
      discountText,
      discountPercentage: finalDiscountPercent
    });

    const productIdMatch = url.match(/MLB-?(\d+)/);
    const productId = productIdMatch ? `MLB${productIdMatch[1]}` : idOrUrl;

    if (title && selectedPrice > 0 && imageUrl) {
      return normalizeOffer({
        id: productId,
        title,
        price: selectedPrice,
        original_price: selectedOriginalPrice,
        discountPercent: finalDiscountPercent,
        permalink: url,
        thumbnail: imageUrl
      }, "mercadolivre-product-page", category);
    }
  } catch (e) {
    console.error(`ML_OFFERS_ENRICH_ERROR: ${url}`, e.message);
  }
  return null;
}

/**
 * Fetch and Enrich: Extracts data directly from HTML results then ENRICHES each item
 */
export async function collectAutomated(query, category = 'todos') {
  console.log(`ML_OFFERS_COLLECT_START: category=${category}, query=${query}`);
  
  const rawOfferUrls = [];
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
        
        $('.ui-search-result, .promotion-item, [class*="poly-card"]').each((i, el) => {
          const productUrl = $(el).find('a').attr('href');
          if (productUrl && productUrl.startsWith('http') && !rawOfferUrls.includes(productUrl)) {
            rawOfferUrls.push(productUrl);
          }
        });
      }
    } catch (e) {
      console.error(`ML_OFFERS_COLLECT_ERROR: Failed to fetch searching ${url}`, e.message);
    }
    if (rawOfferUrls.length >= 15) break;
  }

  console.log(`ML_OFFERS_ENRICH_START: ${rawOfferUrls.length} items to enrich`);
  const enrichedOffers = [];
  
  // Enrich each offer (sequentially or in small batches to respect limits)
  for (const productUrl of rawOfferUrls.slice(0, 10)) { // Limit to 10 for performance
     const enriched = await scrapeProductPage(productUrl, category);
     if (enriched) {
       enrichedOffers.push(enriched);
     }
  }

  console.log(`ML_OFFERS_NORMALIZED_COUNT: ${enrichedOffers.length} valid offers enriched and saved`);
  return enrichedOffers;
}

/**
 * Save valid offers to Firestore
 */
export async function saveOffers(offers) {
  if (!offers || offers.length === 0) return 0;
  
  const db = getAdminDb();
  console.log(`ML_OFFERS_FIRESTORE_SAVE_START: Saving ${offers.length} items`);
  const batch = db.batch();
  let savedCount = 0;

  for (const offer of offers) {
    const docRef = db.collection("offer_bank").doc(`mercadolivre_${offer.productId}`);
    batch.set(docRef, offer, { merge: true });
    savedCount++;
  }

  await batch.commit();
  console.log(`ML_OFFERS_FIRESTORE_SAVE_SUCCESS: ${savedCount} items saved`);
  return savedCount;
}
