import { getAdminDb } from "../../../lib/firebaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = getAdminDb();
    
    // URL das ofertas do Mercado Livre
    const sourceUrl = "https://www.mercadolivre.com.br/ofertas#nav-header";
    
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      }
    });
    
    const html = await response.text();
    
    // Tenta extrair o JSON de estado do Mercado Livre
    // O ML muitas vezes coloca os dados em window.__PRELOADED_STATE__
    const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({.+?});/);
    
    let products = [];
    
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        // A estrutura do estado do ML muda, mas geralmente as ofertas estão em algum lugar dentro de 'results' ou 'initialState'
        // Vou procurar recursivamente ou por caminhos conhecidos.
        // Como o scraper é "expert", vou tentar encontrar a lista de itens.
        
        const items = state?.initialState?.components?.results || [];
        
        products = items.map(item => {
          const id = item.id;
          const title = item.title;
          const image = item.thumbnail || item.image;
          const price = item.price?.regular || item.price?.amount;
          const oldPrice = item.price?.old || item.price?.previous;
          const discount = item.price?.discount_percentage;
          const link = item.permalink;
          const category = item.category_id || "Geral";
          
          return {
            product_id: id,
            product_name: title,
            product_image: image,
            product_price: price,
            product_old_price: oldPrice,
            product_discount: discount ? `${discount}%` : null,
            product_original_link: link,
            marketplace: "Mercado Livre",
            category: category,
            status: "active",
            source_url: sourceUrl,
            collected_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        });
      } catch (e) {
        console.error("Erro ao parsear JSON do Mercado Livre:", e);
      }
    }
    
    // Se não encontrou via JSON, tenta uma busca básica por Regex (Fallback)
    if (products.length === 0) {
       // Regex simplificada para pegar alguns dados se o JSON falhar
       // Nota: Coleta via Regex é frágil, o ideal é o JSON de estado acima.
    }

    if (products.length === 0) {
      return res.status(200).json({ ok: false, message: "Nenhuma oferta encontrada na página.", count: 0 });
    }

    let updatedCount = 0;
    let createdCount = 0;

    const offersRef = db.collection("affiliate_offers");

    for (const prod of products) {
      if (!prod.product_id) continue;
      
      // Busca por product_id para evitar duplicidade
      const existing = await offersRef.where("product_id", "==", prod.product_id).limit(1).get();
      
      if (!existing.empty) {
        const docId = existing.docs[0].id;
        await offersRef.doc(docId).update({
          product_price: prod.product_price,
          product_old_price: prod.product_old_price,
          product_discount: prod.product_discount,
          product_image: prod.product_image,
          updated_at: prod.updated_at,
          status: "active"
        });
        updatedCount++;
      } else {
        await offersRef.add(prod);
        createdCount++;
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Sincronização concluída. ${createdCount} novas, ${updatedCount} atualizadas.`,
      created: createdCount,
      updated: updatedCount
    });

  } catch (error) {
    console.error("ML_SYNC_DAILY_ERROR", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
