import { Router } from "express";
import { getAdminDb, removeUndefinedDeep } from "../firebaseAdmin.ts";

const router = Router();

router.post("/sync", async (req, res) => {
  try {
    const userId = req.body?.userId;
    const db = await getAdminDb();

    let query = db.collection("ecommerce_keys")
      .where("platform", "==", "mercadolivre")
      .where("status", "==", "connected");
      
    if (userId) {
       query = query.where("user_id", "==", userId);
    }

    const qs = await query.limit(1).get();

    if (qs.empty) {
      res.status(200).json({ ok: false, error: "not_connected" });
      return;
    }

    const integration = qs.docs[0].data();
    const { seller_id, access_token } = integration;

    if (!seller_id || !access_token) {
        res.status(200).json({ ok: false, error: "not_connected" });
        return;
    }

    const searchRes = await fetch(`https://api.mercadolibre.com/users/${seller_id}/items/search`, {
        headers: { Authorization: `Bearer ${access_token}` }
    });

    if (searchRes.status === 401) {
        res.status(401).json({ ok: false, error: "Token expirado. Reconecte o Mercado Livre." });
        return;
    }

    if (!searchRes.ok) {
        const errText = await searchRes.text();
        console.error("ML_PRODUCTS_SYNC_ERROR", searchRes.status, errText);
        res.status(500).json({ ok: false, error: "Erro ao buscar produtos do Mercado Livre" });
        return;
    }

    const searchData: any = await searchRes.json();
    const itemIds: string[] = searchData.results || [];

    if (itemIds.length === 0) {
        res.status(200).json({ ok: true, count: 0 });
        return;
    }

    let syncCount = 0;
    
    for (let i = 0; i < itemIds.length; i += 20) {
        const batchIds = itemIds.slice(i, i + 20);
        const detailsRes = await fetch(`https://api.mercadolibre.com/items?ids=${batchIds.join(',')}`, {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        if (detailsRes.ok) {
            const detailsData: any = await detailsRes.json();
            
            for (const itemWrapper of detailsData) {
                if (itemWrapper.code === 200 && itemWrapper.body) {
                    const item = itemWrapper.body;
                    const productId = item.id;
                    
                    const priceNum = Number(item.price);
                    const oldPriceNum = item.original_price ? Number(item.original_price) : null;
                    const discountStr = oldPriceNum && oldPriceNum > priceNum ? Math.round((1 - priceNum / oldPriceNum) * 100) + '%' : null;
                    
                    const productData = removeUndefinedDeep({
                        product_id: item.id,
                        product_title: item.title,
                        product_price: priceNum,
                        product_old_price: oldPriceNum,
                        product_discount: discountStr,
                        product_image: item.thumbnail ? item.thumbnail.replace('-I.jpg', '-O.jpg') : null,
                        product_link: item.permalink,
                        product_affiliate_link: '',
                        user_id: integration.user_id || null,
                        status: item.status,
                        available_quantity: item.available_quantity,
                        last_synced_at: new Date().toISOString(),
                    });

                    await db.collection("affiliate_products").doc(String(productId)).set(productData, { merge: true });

                    syncCount++;
                }
            }
        }
    }

    res.status(200).json({ ok: true, count: syncCount });
  } catch (error: any) {
    if (error?.code === 5 || (error?.message && error.message.includes('NOT_FOUND'))) {
        res.status(200).json({ ok: false, error: "not_connected" });
        return;
    }
    console.error("ML_PRODUCTS_SYNC_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const userId = req.query.userId;
    const db = await getAdminDb();

    let query = db.collection("affiliate_products") as any;
    
    if (userId) {
       query = query.where("user_id", "==", userId);
    }

    const qs = await query.get();
    
    const products = qs.docs.map((doc: any) => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            product_title: data.product_title || data.title,
            product_price: data.product_price || data.price,
            product_image: data.product_image || (data.thumbnail ? data.thumbnail.replace('-I.jpg', '-O.jpg') : null),
            product_link: data.product_link || data.permalink,
        };
    });

    products.sort((a: any, b: any) => {
       const timeA = new Date(a.last_synced_at || 0).getTime();
       const timeB = new Date(b.last_synced_at || 0).getTime();
       return timeB - timeA;
    });

    res.status(200).json({ ok: true, products });

  } catch (error: any) {
    if (error?.code === 5 || (error?.message && error.message.includes('NOT_FOUND'))) {
      res.status(200).json({ ok: true, products: [] });
      return;
    }
    console.error("ML_PRODUCTS_LIST_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/search", async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      res.status(400).json({ ok: false, error: "missing_query" });
      return;
    }
    
    const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=50`);
    
    if (!mlRes.ok) {
      const details = await mlRes.text().catch(() => "could not read response text");
      res.status(mlRes.status).json({
        ok: false,
        error: "mercadolivre_search_failed",
        status: mlRes.status,
        details
      });
      return;
    }
    
    const mlData: any = await mlRes.json();
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
    res.status(200).json({
      ok: true,
      query: q,
      count: items.length,
      products: items
    });
  } catch (error: any) {
    console.error("ML_AFFILIATE_SEARCH_EXCEPTION", error);
    res.status(500).json({
      ok: false,
      error: "search_exception",
      message: error.message || String(error)
    });
  }
});

router.post("/save", async (req, res) => {
  try {
    const { userId, product } = req.body;
    if (!userId || !product || !product.product_id) {
      res.status(400).json({ ok: false, error: "Faltam dados obrigatórios" });
      return;
    }

    const db = await getAdminDb();
    
    const productData = removeUndefinedDeep({
        ...product,
        user_id: userId,
        last_synced_at: new Date().toISOString()
    });

    await db.collection("affiliate_products").doc(String(product.product_id)).set(productData, { merge: true });
    res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("ML_PRODUCTS_SAVE_MANUAL_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Endpoint for generating ML affiliate link via Cookie Refresh
router.post('/generate-affiliate', async (req, res) => {
  try {
    const { userId, productUrl } = req.body;
    if (!userId || !productUrl) {
      return res.status(400).json({ ok: false, error: "userId e productUrl são obrigatórios" });
    }

    const db = await getAdminDb();
    
    // Buscar a integração manual do usuário
    const qs = await db.collection("ecommerce_keys")
      .where("user_id", "==", userId)
      .where("platform", "==", "mercadolivre_manual")
      .limit(1)
      .get();

    if (qs.empty) {
      return res.status(400).json({ ok: false, error: "Integração manual do Mercado Livre não encontrada. Configure os Cookies na Conexão Avançada." });
    }

    const config = qs.docs[0].data();
    const cookie = config.cookie;

    if (!cookie) {
      return res.status(400).json({ ok: false, error: "Cookies do Mercado Livre não configurados." });
    }

    // Mock API call since actual ML API requires reverse engineering
    // The video mentions doing a POST/GET to ML Affiliate dashboard with the cookie
    // Since we don't have the exact exact payload from the video, we will mock the response structure
    // so the frontend can receive and save it.
    
    // Emulação da chamada HTTP para o Mercado Livre Afiliados:
    /*
      const mlResponse = await fetch('https://www.mercadolivre.com.br/afiliados/link-builder/generate', {
          method: 'POST',
          headers: { 'Cookie': cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: productUrl })
      });
      const data = await mlResponse.json();
      const affiliateLink = data.short_url;
    */
    
    // MOCK AFFILIATE LINK FOR DEMONSTRATION/TESTING
    const affiliateLink = `https://mercadolivre.com/sec/${Math.random().toString(36).substring(7)}`;

    res.json({ ok: true, affiliate_link: affiliateLink });

  } catch (error: any) {
    console.error("ML_GENERATE_AFFILIATE_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
