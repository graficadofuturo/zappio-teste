import fs from 'fs';

let content = fs.readFileSync('api/_lib/ml-utils.js', 'utf8');

// Using regex to replace the function normalizeOffer with normalizeMlOffer
content = content.replace(/export function normalizeOffer\([\s\S]*?\n\}\n/m, `export function normalizeMlOffer(raw) {
  let {
     productId,
     title,
     titleOriginal,
     price,
     originalPrice,
     discountPercent,
     imageUrl,
     productUrl,
     category,
     source
  } = raw;

  if (typeof price !== 'number' || isNaN(price) || price <= 0) return null;
  if (!title || title.length < 5) return null;
  if (!productId || productId.startsWith("url_")) return null;
  if (!productUrl || !productUrl.startsWith("http") || !imageUrl) return null;

  if (typeof originalPrice !== 'number' || isNaN(originalPrice) || originalPrice <= price) {
      originalPrice = null;
  }

  let hasDiscount = false;
  if (originalPrice !== null) {
      hasDiscount = true;
      if (typeof discountPercent !== 'number' || isNaN(discountPercent)) {
          discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
      }
  } else {
      discountPercent = null;
  }

  let finalCategory = normalizeOfferCategory(category, titleOriginal || title, "");
  if (finalCategory.toLowerCase() === "automotivo" || finalCategory.toLowerCase() === "todos") {
      finalCategory = "Geral";
  }

  let fullTitle = (titleOriginal || title).trim();
  const half = Math.floor(fullTitle.length / 2);
  if (fullTitle.length > 20 && fullTitle.slice(0, half) === fullTitle.slice(half)) {
    fullTitle = fullTitle.slice(0, half).trim();
  }

  const shortTitle = simplifyProductTitle(fullTitle);
  
  return {
     marketplace: "mercadolivre",
     productId: String(productId),
     title: shortTitle,
     titleOriginal: fullTitle,
     titleShort: shortTitle,
     price: price,
     originalPrice: originalPrice,
     discountPercent: discountPercent,
     hasDiscount: hasDiscount,
     imageUrl: imageUrl.replace("-I.jpg", "-O.jpg"),
     productUrl: productUrl,
     category: finalCategory,
     status: "active",
     source: source || 'auto_collector',
     collectedAt: new Date().toISOString(),
     updatedAt: new Date().toISOString()
  };
}
`);

// Replace scrapeProductPage logic
content = content.replace(/export async function scrapeProductPage[\s\S]*?\} catch \(e\) \{/m, `export async function scrapeProductPage(idOrUrl, category = 'todos') {
  const url = idOrUrl.startsWith('http') ? idOrUrl : \`https://www.mercadolivre.com.br/p/\${idOrUrl}\`;
  
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
    
    const title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
    const imageUrl = $('meta[property="og:image"]').attr('content');
    
    const getAmountFromEl = (el) => {
      let fraction = $(el).find('.andes-money-amount__fraction').first().text().replace(/\\./g, '');
      let cents = $(el).find('.andes-money-amount__cents').first().text() || '00';
      if (!fraction) {
         const textPrice = $(el).text().replace(/[^\\d,.-]/g, '');
         if (textPrice) {
            const parsed = parseFloat(textPrice.replace(',', '.'));
            if (!isNaN(parsed)) return parsed;
         }
         return null;
      }
      return parseFloat(\`\${fraction}.\${cents}\`);
    };

    let price = null;
    const priceMeta1 = $('meta[itemprop="price"]').attr('content');
    const priceMeta2 = $('span[itemprop="offers"] meta[itemprop="price"]').attr('content');
    
    if (priceMeta1) price = parseFloat(priceMeta1);
    else if (priceMeta2) price = parseFloat(priceMeta2);
    else {
       let pEl1 = $('.ui-pdp-price__second-line .andes-money-amount').first();
       if (pEl1.length) price = getAmountFromEl(pEl1);
       else {
          let pEl2 = $('.andes-money-amount:not(.andes-money-amount--previous):not(del *)').first();
          if (pEl2.length) price = getAmountFromEl(pEl2);
       }
    }

    let originalPrice = null;
    const opEl1 = $('s.ui-pdp-price__original-value').first();
    const opEl2 = $('.ui-pdp-price__original-value').first();
    const opEl3 = $('s[aria-label^="Antes:"]').first();
    
    if (opEl1.length) originalPrice = getAmountFromEl(opEl1);
    else if (opEl2.length) originalPrice = getAmountFromEl(opEl2);
    else if (opEl3.length) originalPrice = getAmountFromEl(opEl3);
    
    if (originalPrice && price && originalPrice <= price) {
       originalPrice = null;
    }

    let discountPercent = null;
    if (price > 0 && originalPrice > price) {
        const discountText = $('.ui-pdp-price__discount, [class*="discount"]').first().text().trim();
        const discMatch = discountText.match(/(\\d+)%\\s*OFF/i);
        if (discMatch) {
           discountPercent = parseInt(discMatch[1]);
        } else {
           discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
        }
    }
    
    const productIdMatch = url.match(/MLB-?(\\d+)/);
    const productId = productIdMatch ? \`MLB\${productIdMatch[1]}\` : idOrUrl;

    if (title && price > 0 && imageUrl) {
      return normalizeMlOffer({
        productId,
        title,
        price,
        originalPrice,
        discountPercent,
        imageUrl,
        productUrl: url,
        category,
        source: "mercadolivre-product-page"
      });
    }
  } catch (e) {`);

fs.writeFileSync('api/_lib/ml-utils.js', content);
console.log('rewritten ml-utils.js!');
