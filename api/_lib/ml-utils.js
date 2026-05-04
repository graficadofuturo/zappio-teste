import * as cheerio from 'cheerio';
import { getAdminDb } from './firebase-admin.js';

const ML_SEARCH_URL = "https://api.mercadolibre.com/sites/MLB/search";
const ML_ITEM_URL = "https://api.mercadolibre.com/items/";
const ML_HTML_SEARCH_BASE = "https://lista.mercadolivre.com.br/";

export const CATEGORY_TERMS = {
  tecnologia: ["smartphone", "notebook", "smart tv", "fone bluetooth", "monitor"],
  casa_moveis: ["mesa", "cadeira", "sofá", "guarda roupa", "colchão"],
  eletrodomesticos: ["air fryer", "microondas", "geladeira", "cooktop", "aspirador"],
  esporte_fitness: ["whey protein", "creatina", "bicicleta", "esteira", "halter"],
  ferramentas: ["furadeira", "parafusadeira", "kit ferramentas", "esmerilhadeira", "compressor"],
  moda: ["tênis", "mochila", "camiseta", "relógio", "óculos"],
  beleza: ["secador cabelo", "escova secadora", "perfume", "barbeador", "chapinha"],
  automotivo: ["pneu", "suporte celular carro", "câmera de ré", "multimídia carro", "aspirador carro"]
};

/**
 * Standardize an offer payload for Firestore
 */
export function normalizeOffer(item, source = 'api_search', category = 'todos') {
  const originalPrice = item.original_price ?? item.originalPrice ?? null;
  const price = item.price ?? null;
  let discountPercent = null;
  if (originalPrice && price && originalPrice > price) {
    discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  const thumbnail = item.thumbnail || item.image || null;
  const image = thumbnail ? thumbnail.replace("-I.jpg", "-O.jpg") : null;

  const offer = {
    marketplace: "mercadolivre",
    marketplaceProductId: String(item.id || item.marketplaceProductId),
    title: item.title || null,
    price: price,
    originalPrice: originalPrice,
    currencyId: item.currency_id || item.currencyId || "BRL",
    thumbnail: thumbnail,
    image: image,
    productUrl: item.permalink || item.productUrl || null,
    affiliateUrl: item.affiliateUrl || null,
    category: category,
    sellerId: item.seller?.id ? String(item.seller.id) : (item.sellerId ? String(item.sellerId) : null),
    sellerNickname: item.seller?.nickname || item.sellerNickname || null,
    condition: item.condition || null,
    availableQuantity: item.available_quantity ?? item.availableQuantity ?? null,
    soldQuantity: item.sold_quantity ?? item.soldQuantity ?? null,
    discountPercent: item.discountPercent ?? discountPercent,
    source: source,
    collectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true
  };

  // Remove null/undefined values
  return Object.fromEntries(
    Object.entries(offer).filter(([_, v]) => v !== undefined && v !== null)
  );
}

/**
 * Get ML Access Token from Firestore
 */
async function getMLAccessToken() {
  try {
    const db = getAdminDb();
    // Assuming integration is stored in a generic way or specific to ML
    // Try to find any ML integration
    const snap = await db.collection("integrations")
      .where("marketplace", "==", "mercadolivre")
      .limit(1)
      .get();

    if (!snap.empty) {
      return snap.docs[0].data().accessToken;
    }
  } catch (e) {
    console.error("Error getting ML access token:", e);
  }
  return null;
}

/**
 * Try searching via API
 */
export async function searchByAPI(query, limit = 10, category = 'tecnologia') {
  const accessToken = await getMLAccessToken();
  const headers = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; ZappioBot/1.0; +https://zappio-bot.com)",
    "Origin": "https://mercadolivre.com.br",
    "Referer": "https://mercadolivre.com.br/"
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const url = `${ML_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url, { headers });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw { status: res.status, body: errorText };
  }

  const data = await res.json();
  const results = data.results || [];
  
  return results.map(item => normalizeOffer(item, "mercadolivre_api_search", category));
}

/**
 * Try searching via HTML Scraping
 */
export async function searchByHTML(query, category = 'todos') {
  // Try standard the list page first
  const searchUrl = `${ML_HTML_SEARCH_BASE}${encodeURIComponent(query.replace(/\s+/g, '-'))}`;
  const offersUrl = `https://www.mercadolivre.com.br/ofertas?q=${encodeURIComponent(query)}`;
  
  let html = "";
  let usedUrl = searchUrl;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"
      }
    });
    html = await res.text();
    
    if (html.includes("suspicious-traffic-frontend")) {
      console.log(`[ML] Search page blocked for "${query}", trying offers page fallback...`);
      const resFallback = await fetch(offersUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"
        }
      });
      html = await resFallback.text();
      usedUrl = offersUrl;
    }
  } catch (e) {
    console.error(`[ML] HTML search failed for ${searchUrl}`, e);
    // Try fallback anyway
    const resFallback = await fetch(offersUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"
      }
    });
    html = await resFallback.text();
    usedUrl = offersUrl;
  }

  const $ = cheerio.load(html);
  const products = [];

  // Parse HTML
  // Selector for standard search
  $('.ui-search-result__wrapper, .promotion-item, [class*="polycard"]').each((i, el) => {
    const title = $(el).find('.ui-search-item__title, .promotion-item__title, [class*="title"]').text().trim();
    const link = $(el).find('a.ui-search-link, a.promotion-item__link-container, a[href*="MLB"]').attr('href');
    const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
    
    // Price extraction is tricky across different pages
    const priceText = $(el).find('.price-tag-fraction, .promotion-item__price, [class*="price"]').first().text().replace(/\./g, '').replace(/[^\d]/g, '');
    const price = parseFloat(priceText) || 0;

    if (link && title) {
       products.push({
         title,
         permalink: link,
         thumbnail: img,
         price,
         id: link.match(/MLB-?(\d+)/)?.[1] ? `MLB${link.match(/MLB-?(\d+)/)[1]}` : `url_${Buffer.from(link).toString('hex').slice(0, 16)}`
       });
    }
  });

  // If no products and we have MLB IDs in HTML, let's try to at least get links
  if (products.length === 0) {
    const mlbMatches = html.match(/href=\"([^\"]*MLB[^\"]*)\"/g) || [];
    const uniqueLinks = [...new Set(mlbMatches.map(m => m.match(/href=\"([^\"]+)\"/)[1]))];
    
    for (const link of uniqueLinks.slice(0, 10)) {
       const idMatch = link.match(/MLB-?(\d+)/);
       if (idMatch) {
          products.push({
            permalink: link,
            id: `MLB${idMatch[1]}`,
            title: "Produto Mercado Livre" // Placeholder until item fetch
          });
       }
    }
  }

  return products.map(p => normalizeOffer(p, "html_public_pages", category));
}

/**
 * Fetch a single item by ID or URL
 */
export async function fetchItemInfo(itemIdOrUrl, category = 'tecnologia') {
  let itemId = itemIdOrUrl;
  if (itemIdOrUrl.includes('http')) {
    const match = itemIdOrUrl.match(/MLB-?(\d+)/);
    if (match) {
      itemId = `MLB${match[1]}`;
    } else {
      // It's a link but not a standard MLB ID one, try scraping the link directly
      return await scrapeDirectLink(itemIdOrUrl, category);
    }
  }

  // Try API first
  try {
    const res = await fetch(`${ML_ITEM_URL}${itemId}`);
    if (res.ok) {
      const data = await res.json();
      return normalizeOffer(data, "mercadolivre_api_item", category);
    }
  } catch (e) {
    console.error(`API fetch failed for item ${itemId}, trying HTML...`);
  }

  // Fallback to scraping if it's a URL or if we can construct one
  const url = itemIdOrUrl.includes('http') ? itemIdOrUrl : `https://www.mercadolivre.com.br/p/${itemId}`;
  return await scrapeDirectLink(url, category);
}

async function scrapeDirectLink(url, category = 'tecnologia') {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
  });

  if (!res.ok) throw new Error(`Scraping failed for ${url}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('meta[property="og:title"]').attr('content') || $('h1').text();
  const image = $('meta[property="og:image"]').attr('content');
  const price = parseFloat($('meta[property="product:price:amount"]').attr('content')) || 0;
  const itemId = url.match(/MLB-?(\d+)/)?.[1] ? `MLB${url.match(/MLB-?(\d+)/)[1]}` : `url_${Buffer.from(url).toString('hex').slice(0, 16)}`;

  return normalizeOffer({
    id: itemId,
    title,
    permalink: url,
    thumbnail: image,
    price
  }, "mercadolivre_manual_import", category);
}

/**
 * Save multiple offers to Firestore
 */
export async function saveOffers(offers) {
  const db = getAdminDb();
  let savedCount = 0;
  const batch = db.batch();

  for (const offer of offers) {
    const docRef = db.collection("offer_bank").doc(`mercadolivre_${offer.marketplaceProductId}`);
    batch.set(docRef, offer, { merge: true });
    savedCount++;
  }

  await batch.commit();
  return savedCount;
}
