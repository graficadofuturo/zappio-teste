export const CAMPAIGN_CATEGORIES: Record<string, string[]> = {
  'Geral': ['produto', 'oferta', 'promoção', 'kit', 'caixa', 'acessório', 'legal'],
  'Tecnologia': ['celular', 'smartphone', 'notebook', 'fone bluetooth', 'smartwatch', 'carregador', 'tablet'],
  'Casa e Cozinha': ['sofá', 'cadeira', 'mesa', 'guarda roupa', 'colchão', 'geladeira', 'air fryer', 'panela'],
  'Esporte e Fitness': ['bicicleta ergométrica', 'halter', 'creatina', 'esteira', 'whey', 'tênis corrida', 'bola'],
  'Ferramentas': ['parafusadeira', 'furadeira', 'kit ferramentas', 'serra', 'lixadeira', 'compressor', 'chave de impacto'],
  'Beleza e Saúde': ['perfume', 'maquiagem', 'secador', 'chapinha', 'creme', 'protetor solar', 'skincare'],
  'Moda': ['camiseta', 'calça', 'tênis', 'vestido', 'bolsa', 'jaqueta', 'moletom'],
  'Brinquedos': ['brinquedo', 'boneca', 'lego', 'carrinho', 'jogo', 'quebra-cabeça'],
  'Automotivo': ['pneu', 'som automotivo', 'acessório carro', 'óleo motor', 'câmera de ré', 'tapete carro', 'lavadora']
};

export function getRandomKeyword(category: string): string {
    const list = CAMPAIGN_CATEGORIES[category];
    if (!list || list.length === 0) {
       const all = Object.values(CAMPAIGN_CATEGORIES).flat();
       return all[Math.floor(Math.random() * all.length)];
    }
    return list[Math.floor(Math.random() * list.length)];
}

export async function getNextProductForCampaign(db: any, campaignId: string, category: string, marketplace: string, excludeProductIds: string[] = [], allowedMarketplaces?: string[]) {
  // 1. Get history of sent products for this campaign
  const historyRef = db.collection('campaign_product_history');
  const historySnapshot = await historyRef.where('campaign_id', '==', campaignId).get();
  const sentProductIds = historySnapshot.docs.map((doc: any) => doc.data().product_id);

  // 2. Fetch active offers with filters
  let query = db.collection('offer_bank').where('status', '==', 'active');

  if (category && category !== 'Todos') {
    query = query.where('category', '==', category);
  }

  if (marketplace && marketplace !== 'all') {
    query = query.where('marketplace', '==', marketplace);
  }

  // 3. Get the most recently updated offers 
  const offersSnapshot = await query.limit(200).get();
  let offers = offersSnapshot.docs.map((doc: any) => {
    const data = doc.data();
    return { 
      id: doc.id,
      product_id: data.productId || doc.id,
      product_price: data.price,
      product_old_price: data.originalPrice,
      product_discount: data.discountPercent ? `${data.discountPercent}% OFF` : null,
      product_affiliate_link: data.affiliateUrl,
      product_original_link: data.productUrl,
      product_name: data.titleOriginal || data.title,
      titleShort: data.titleShort || data.title,
      product_image: data.imageUrl,
      marketplace: data.marketplace,
      category: data.category,
      ...data 
    };
  });
  // Sort in memory by updatedAt descending
  offers.sort((a: any, b: any) => {
    const timeA = a.updatedAt?.toDate?.()?.getTime() || a.updatedAt || 0;
    const timeB = b.updatedAt?.toDate?.()?.getTime() || b.updatedAt || 0;
    return timeB - timeA;
  });

  // Filter by allowed marketplaces if provided
  if (allowedMarketplaces && allowedMarketplaces.length > 0) {
    const allowedSet = new Set(allowedMarketplaces);
    // Be flexible with marketplace names (mercadolivre vs mercado_livre etc)
    offers = offers.filter(o => 
      allowedSet.has(o.marketplace) || 
      ((o.marketplace === 'mercadolivre' || o.marketplace === 'mercado_livre' || o.marketplace === 'Mercado Livre') && (allowedSet.has('mercadolivre') || allowedSet.has('mercado_livre') || allowedSet.has('mercadolivre_global')))
    );
  }

  // 4. Filter out already sent products
  const sentSet = new Set([...sentProductIds, ...excludeProductIds]);
  const availableOffers = offers.filter((offer: any) => !sentSet.has(offer.product_id) && !sentSet.has(offer.id));

  if (availableOffers.length === 0) {
    if (offers.length > 0) {
       // Reset cycle if we have offers but they are all sent
       try {
           const batch = db.batch();
           historySnapshot.docs.forEach((doc: any) => {
               batch.delete(doc.ref);
           });
           await batch.commit();
           return offers[0];
       } catch (e) {
           console.error("Error resetting campaign history:", e);
           return null;
       }
    }
    return null; // All products in this batch were sent, or none exist
  }

  // 5. Return the first one 
  return availableOffers[0];
}

export async function recordProductSent(db: any, campaignId: string, productId: string, userId: string) {
  await db.collection('campaign_product_history').add({
    campaign_id: campaignId,
    product_id: productId,
    user_id: userId,
    sent_at: new Date().toISOString() // Use ISO string as admin SDK doesn't always have fieldvalue easily without import
  });
}

import { resolveAffiliateLinkForSending as resolveAffiliate } from '../services/affiliateService.js';

export async function resolveProductLinkForSending(db: any, product: any, userId: string, campaignId?: string): Promise<string> {
    const originalUrl = product.productUrl || product.url || product.permalink || product.product_original_link;

    if (!originalUrl) {
        console.warn("[Affiliate] AFFILIATE_LINK_RESOLVE_FAIL: No original URL");
        return "";
    }

    let ownerUid = userId;
    let campaignData: any = null;
    
    // If no userId provided, try to fetch from campaign
    if (campaignId) {
        try {
            const campDoc = await db.collection("campaigns").doc(campaignId).get();
            if (campDoc.exists) {
                campaignData = campDoc.data();
                if (!ownerUid) {
                  ownerUid = campaignData.userId || campaignData.user_id || campaignData.ownerId || campaignData.uid;
                }
            }
        } catch (e) {
            console.error("[Affiliate] Error fetching campaign for UID recovery:", e);
        }
    }

    console.log("AFFILIATE_LINK_OWNER_UID_RESOLVED", {
        campaignId: campaignId || null,
        campaignUserId: campaignData?.userId || campaignData?.user_id || null,
        campaignOwnerId: campaignData?.ownerId || null,
        campaignUid: campaignData?.uid || null,
        receivedUid: userId || null,
        ownerUid
    });

    if (!ownerUid) {
        console.error("[Affiliate] FATAL: Não foi possível identificar o dono da campanha para converter link afiliado.", { campaignId });
        return originalUrl;
    }

    // Call the new pluggable resolution logic
    return await resolveAffiliate({
        uid: ownerUid,
        productUrl: originalUrl,
        marketplace: product.marketplace || 'mercadolivre',
        offerId: product.id,
        campaignId: campaignId
    });
}

export async function fetchMLProductsByKeyword(keyword: string): Promise<any[]> {
    const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(keyword)}&limit=50`);
    if (!mlRes.ok) return [];
    const data = await mlRes.json();
    return data.results || [];
}



export async function applyAffiliateLinks(messageText: string, uid: string): Promise<string> {
    if (!messageText || !uid) return messageText;
    
    const mlRegex = /https?:\/\/(?:www\.)?(?:mercadolivre\.com\.br|produto\.mercadolivre\.com\.br|lista\.mercadolivre\.com\.br)[^\s]*\b/g;
    const matches = messageText.match(mlRegex);
    if (matches && matches.length > 0) {
        try {
            const { convertToAffiliateLink } = await import('../../api_handlers/_lib/ml-utils.js');
            for (const mlUrl of matches) {
                const shortUrl = await convertToAffiliateLink(mlUrl, uid);
                if (shortUrl && shortUrl.includes('meli.la')) {
                    messageText = messageText.replace(mlUrl, shortUrl);
                }
            }
        } catch (e) { console.error('applyAffiliateLinks error:', e); }
    }
    return messageText;
}
