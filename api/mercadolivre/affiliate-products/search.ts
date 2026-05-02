import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const q = req.query.q as string;

    if (!q) {
      return res.status(400).json({
        ok: false,
        error: "missing_query"
      });
    }

    console.log("ML_AFFILIATE_SEARCH_ROUTE_HIT", { q });

    const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=50`);

    console.log("ML_AFFILIATE_SEARCH_ML_RESPONSE", {
      status: mlRes.status,
      ok: mlRes.ok
    });

    if (!mlRes.ok) {
      const details = await mlRes.text().catch(() => "could not read response text");
      return res.status(mlRes.status).json({
        ok: false,
        error: "mercadolivre_search_failed",
        status: mlRes.status,
        details
      });
    }

    const mlData: any = await mlRes.json();
    
    // Map items mapping logic
    const items = (mlData.results || []).map((item: any) => {
      const priceNum = Number(item.price);
      const oldPriceNum = item.original_price ? Number(item.original_price) : null;
      const discountStr = oldPriceNum && oldPriceNum > priceNum ? Math.round((1 - priceNum / oldPriceNum) * 100) + '%' : null;
      
      return {
        product_id: item.id,
        title: item.title,
        price: priceNum,
        old_price: oldPriceNum,
        discount: discountStr,
        currency_id: item.currency_id,
        image: item.thumbnail ? item.thumbnail.replace('-I.jpg', '-O.jpg') : null,
        thumbnail: item.thumbnail,
        product_link: item.permalink,
        seller_id: item.seller?.id,
        seller_name: item.seller?.nickname,
        category_id: item.category_id,
        condition: item.condition,
        available_quantity: item.available_quantity
      };
    });

    return res.status(200).json({
      ok: true,
      query: q,
      count: items.length,
      products: items
    });
    
  } catch (error: any) {
    console.error("ML_AFFILIATE_SEARCH_EXCEPTION", error);
    return res.status(500).json({
      ok: false,
      error: "search_exception",
      message: error.message || String(error)
    });
  }
}
