export const CAMPAIGN_CATEGORIES: Record<string, string[]> = {
  'Todos': ['produto', 'oferta', 'promoção', 'kit', 'caixa', 'acessório', 'legal'],
  'Tecnologia': ['celular', 'smartphone', 'notebook', 'fone bluetooth', 'smartwatch', 'carregador', 'tablet'],
  'Casa e Móveis': ['sofá', 'cadeira', 'mesa', 'guarda roupa', 'colchão', 'rack', 'organizador'],
  'Eletrodomésticos': ['air fryer', 'geladeira', 'fogão', 'cooktop', 'micro-ondas', 'liquidificador', 'cafeteira'],
  'Esporte e Fitness': ['bicicleta ergométrica', 'halter', 'creatina', 'esteira', 'whey', 'tênis corrida', 'bola'],
  'Ferramentas': ['parafusadeira', 'furadeira', 'kit ferramentas', 'serra', 'lixadeira', 'compressor', 'chave de impacto'],
  'Beleza e Cuidados Pessoais': ['perfume', 'maquiagem', 'secador', 'chapinha', 'creme', 'protetor solar', 'skincare'],
  'Moda': ['camiseta', 'calça', 'tênis', 'vestido', 'bolsa', 'jaqueta', 'moletom'],
  'Infantil': ['brinquedo', 'fralda', 'carrinho de bebê', 'roupa infantil', 'mamadeira', 'berço', 'pelúcia'],
  'Pet Shop': ['ração', 'caminha', 'brinquedo pet', 'coleira', 'arranhador', 'shampoo pet', 'caixa de transporte'],
  'Automotivo': ['pneu', 'som automotivo', 'acessório carro', 'óleo motor', 'câmera de ré', 'tapete carro', 'lavadora'],
  'Games': ['console', 'jogo ps5', 'controle xbox', 'headset gamer', 'cadeira gamer', 'nintendo switch', 'mouse gamer'],
  'Cozinha': ['jogo de panelas', 'faqueiro', 'pote de vidro', 'frigideira', 'tábua', 'escorredor', 'kit cozinha'],
  'Saúde': ['medidor de pressão', 'termômetro', 'massageador', 'balança', 'vitamina', 'colágeno', 'inalador'],
  'Ofertas do Dia': ['oferta', 'promoção relâmpago', 'desconto', 'imperdível', 'liquidação', 'saldão', 'barato']
};

export function getRandomKeyword(category: string): string {
    const list = CAMPAIGN_CATEGORIES[category];
    if (!list || list.length === 0) {
       const all = Object.values(CAMPAIGN_CATEGORIES).flat();
       return all[Math.floor(Math.random() * all.length)];
    }
    return list[Math.floor(Math.random() * list.length)];
}

export async function getNextProductForCampaign(db: any, campaignId: string, category: string, marketplace: string) {
  // 1. Get history of sent products for this campaign
  const historyRef = db.collection('campaign_product_history');
  const historySnapshot = await historyRef.where('campaign_id', '==', campaignId).get();
  const sentProductIds = historySnapshot.docs.map((doc: any) => doc.data().product_id);

  // 2. Fetch active offers with filters
  let query = db.collection('affiliate_offers')
    .where('status', 'in', ['active', 'affiliate_ready']);

  if (category && category !== 'Todos') {
    query = query.where('category', '==', category);
  }

  if (marketplace && marketplace !== 'all') {
    query = query.where('marketplace', '==', marketplace);
  }

  const offersSnapshot = await query.orderBy('updated_at', 'desc').get();
  const offers = offersSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

  // 3. Filter out already sent products
  const availableOffers = offers.filter((offer: any) => !sentProductIds.includes(offer.id));

  if (availableOffers.length === 0) {
    return null; // All products sent
  }

  // 4. Return the first one (most recent update)
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

export async function fetchMLProductsByKeyword(keyword: string): Promise<any[]> {
    const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(keyword)}&limit=50`);
    if (!mlRes.ok) return [];
    const data = await mlRes.json();
    return data.results || [];
}
