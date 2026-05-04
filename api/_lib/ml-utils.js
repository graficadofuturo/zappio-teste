import * as cheerio from 'cheerio';
import { getAdminDb } from './firebase-admin.js';

/**
 * Standardize and VALIDATE an offer payload for Firestore
 * Returns null if the offer is invalid.
 */
export function normalizeOffer(item, source = 'auto_collector', category = 'todos') {
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

  let cleanTitle = item.title.trim();
  const half = Math.floor(cleanTitle.length / 2);
  if (cleanTitle.length > 20 && cleanTitle.slice(0, half) === cleanTitle.slice(half)) {
    cleanTitle = cleanTitle.slice(0, half).trim();
  }

  const offer = {
    marketplace: "mercadolivre",
    productId: productId,
    title: cleanTitle,
    price: price,
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : null,
    discountPercent: item.discountPercent ?? discountPercent,
    imageUrl: imageUrl,
    productUrl: productUrl,
    affiliateUrl: item.affiliateUrl || null,
    category: category,
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
 * Scrape a single product page for real data
 */
async function scrapeProductPage(idOrUrl, category = 'todos') {
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
    const priceText = $('meta[property="product:price:amount"]').attr('content') || 
                      $('.andes-money-amount__fraction').first().text().replace(/\./g, '');
    const price = parseFloat(priceText);
    
    const productIdMatch = url.match(/MLB-?(\d+)/);
    const productId = productIdMatch ? `MLB${productIdMatch[1]}` : idOrUrl;

    if (title && price > 0 && imageUrl) {
      return normalizeOffer({
        id: productId,
        title,
        price,
        permalink: url,
        thumbnail: imageUrl
      }, "auto_collector_scrape", category);
    }
  } catch (e) {
    console.error(`ML_OFFERS_SCRAPE_ERROR: ${url}`, e.message);
  }
  return null;
}

/**
 * Fetch and Enrich: Extracts data directly from HTML results to avoid per-item blocks
 */
export async function collectAutomated(query, category = 'todos') {
  console.log(`ML_OFFERS_COLLECT_START: category=${category}, query=${query}`);
  
  const enrichedOffers = [];
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
        
        // ML search results usually have items in these containers
        $('.ui-search-result, .promotion-item, [class*="poly-card"]').each((i, el) => {
          const title = $(el).find('h2, h3, [class*="title"]').text().trim();
          const productUrl = $(el).find('a').attr('href');
          const imageUrl = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
          
          // Price matching is tricky: look for the fraction part
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
              }, "auto_collector_search_list", category);
              
              if (offer) {
                enrichedOffers.push(offer);
              }
            }
          }
        });
      }
    } catch (e) {
      console.error(`ML_OFFERS_COLLECT_ERROR: Failed to fetch ${url}`, e.message);
    }
    if (enrichedOffers.length >= 10) break;
  }

  console.log(`ML_OFFERS_NORMALIZED_COUNT: ${enrichedOffers.length} valid offers extracted`);
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
