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

    if (!mlRes.ok) {
      const details = await mlRes.text().catch(() => "could not read response text");
      return res.status(mlRes.status).json({
        ok: false,
        error: "mercadolivre_fetch_failed",
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
        product_title: item.title,
        product_price: priceNum,
        product_old_price: oldPriceNum,
        product_discount: discountStr,
        product_image: item.thumbnail ? item.thumbnail.replace('-I.jpg', '-O.jpg') : null,
        product_link: item.permalink,
        product_affiliate_link: '',
        status: item.status,
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
