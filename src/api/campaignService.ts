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

export async function fetchMLProductsByKeyword(keyword: string): Promise<any[]> {
    const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(keyword)}&limit=50`);
    if (!mlRes.ok) return [];
    const data = await mlRes.json();
    return data.results || [];
}
