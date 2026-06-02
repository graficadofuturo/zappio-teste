export function renderOfferMessage(template: string, product: Record<string, any>): string {
    return renderAutoOfferMessage(template, product);
}

export function renderAutoOfferMessage(template: string, product: Record<string, any>): string {
    let messageText = template || "";
    if (!messageText || messageText === "AUTO_OFFER_TEMPLATE") {
        messageText = `⚡ {category} | {marketplace}\n\n🛍️ {product_title}\n\n🚫 {product_old_price}\n💲 {product_price}\n📉 {discountPercent}% OFF\n\n🎟️ {product_coupon}\n\n🛒 Comprar agora:\n{product_link}`;
    }

    const priceValue = product.product_price || product.price || 0;
    const oldPriceValue = product.product_old_price || product.originalPrice;
    
    // Determine short name
    const productNameShort = String(product.titleShort || product.product_title || product.title || product.product_name || "");
    const marketplaceOrig = String(product.marketplace || '');
    const marketplaceName = marketplaceOrig === 'mercadolivre' || marketplaceOrig === 'mercadolivre_global' ? 'Mercado Livre' : (marketplaceOrig === 'shopee' ? 'Shopee' : (marketplaceOrig || ''));
    
    const category = String(product.category || product.product_category || 'Geral');

    messageText = messageText.replace(/{category}/gi, category !== 'undefined' ? category : '');
    messageText = messageText.replace(/{marketplace}/gi, marketplaceName !== 'undefined' ? marketplaceName : '');
    
    if (productNameShort && productNameShort !== 'undefined') {
       messageText = messageText.replace(/{product_title}/gi, productNameShort);
       messageText = messageText.replace(/{product_tittle}/gi, productNameShort);
    }
    
    const priceStr = priceValue ? `R$ ${Number(priceValue).toFixed(2).replace('.', ',')}` : '';
    if (priceStr && priceStr !== 'undefined') {
       messageText = messageText.replace(/{product_price}/gi, priceStr);
    } else {
       messageText = messageText.split('\n').filter((l: string) => !l.includes('{product_price}')).join('\n');
    }
    
    // Improved removal logic for old price
    const numPrice = Number(priceValue);
    const numOldPrice = Number(oldPriceValue);
    const isOldPriceValid = oldPriceValue && !isNaN(numOldPrice) && numOldPrice > 0 && numOldPrice > numPrice;

    if (!isOldPriceValid) {
        messageText = messageText.split('\n').filter((l: string) => !l.includes('{product_old_price}')).join('\n');
    } else {
        const oldPriceStr = `~R$ ${numOldPrice.toFixed(2).replace('.', ',')}~`;
        messageText = messageText.replace(/{product_old_price}/gi, oldPriceStr);
    }

    const discountValue = product.discountPercent || product.product_discount;
    if (!discountValue || discountValue === '0' || discountValue === 0 || String(discountValue) === 'undefined') {
        messageText = messageText.split('\n').filter((l: string) => !l.includes('{discountPercent}') && !l.includes('{product_discount}')).join('\n');
    } else {
        const discText = String(discountValue).replace('% OFF', '').trim();
        messageText = messageText.replace(/{discountPercent}/gi, discText);
        messageText = messageText.replace(/{product_discount}/gi, discText);
    }

    const coupon = String(product.couponCode || product.cupom || product.product_coupon || '');
    if (!coupon || coupon === 'undefined' || coupon.trim() === '' || coupon === 'null' || coupon === '[object Object]') {
        messageText = messageText.split('\n').filter((l: string) => !l.includes('{product_coupon}') && !l.includes('{product_cupom}')).join('\n');
    } else {
        messageText = messageText.replace(/{product_coupon}/gi, coupon);
        messageText = messageText.replace(/{product_cupom}/gi, coupon);
    }
    
    // Consistent link selection
    const linkStr = String(product.product_affiliate_link || product.affiliateUrl || product.product_link || product.product_original_link || product.productUrl || product.url || '');
    if (linkStr && linkStr !== 'undefined' && linkStr !== 'null' && linkStr !== '[object Object]') {
       messageText = messageText.replace(/{product_link}/gi, linkStr);
       messageText = messageText.replace(/{product_affiliate_link}/gi, linkStr);
    } else {
       messageText = messageText.replace(/{product_link}/gi, '');
       messageText = messageText.replace(/{product_affiliate_link}/gi, '');
    }
    
    // Remove specific unreplaced placeholders and cleanup
    messageText = messageText.replace(/\{(product_image|product_store|product_stock|product_id|category|marketplace|product_title|product_tittle|product_price|product_old_price|discountPercent|product_coupon|product_cupom)\}/gi, '');

    // Replace ANY undefined/object string remnants
    messageText = messageText.replace(/undefined/g, '');
    messageText = messageText.replace(/null/g, '');
    messageText = messageText.replace(/\[object Object\]/g, '');

    // Final cleanup of extra white lines without removing spaces
    const lines = messageText.split('\n');
    const resultLines: string[] = [];
    let emptyLineCount = 0;

    for (let line of lines) {
        const rTrimmed = line.replace(/\s+$/, '');
        if (rTrimmed === '') {
            emptyLineCount++;
            if (emptyLineCount <= 1) {
                resultLines.push('');
            }
        } else {
            emptyLineCount = 0;
            resultLines.push(rTrimmed);
        }
    }

    return resultLines.join('\n').trim();
}



