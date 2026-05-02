import { Router } from 'express';
import { getAdminDb } from '../firebaseAdmin.ts';
import crypto from 'crypto';

const router = Router();

// Endpoint placeholder for Shopee
router.get("/status", (req, res) => {
  res.json({ connected: false });
});

// Endpoint for Shopee Affiliate Link generation
router.post('/generate-affiliate', async (req, res) => {
  try {
    const { userId, productUrl } = req.body;
    if (!userId || !productUrl) {
      return res.status(400).json({ ok: false, error: "userId e productUrl são obrigatórios" });
    }

    const db = await getAdminDb();
    const qs = await db.collection("ecommerce_keys")
      .where("user_id", "==", userId)
      .where("platform", "==", "shopee")
      .where("status", "==", "connected")
      .limit(1)
      .get();

    if (qs.empty) {
      return res.status(400).json({ ok: false, error: "Integração Shopee não encontrada. Configure o AppID e AppSecret na página Integrações." });
    }

    const config = qs.docs[0].data();
    const appId = config.api_key;
    const appSecret = config.api_secret;

    if (!appId || !appSecret) {
      return res.status(400).json({ ok: false, error: "Credenciais da Shopee incompletas." });
    }

    // A chamada oficial da Shopee Open API requer uma assinatura baseada no timestamp, appId, appSecret.
    // Documentação da Shopee (Video 3) usa SHA256 para gerar o sign.
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = appId + timestamp + appSecret;
    const sign = crypto.createHash('sha256').update(payload).digest('hex');

    // Essa é uma simulação da chamada real de API, de acordo com o padrão Open API.
    /*
    const apiReq = await fetch('https://partnerapi.shopee.com.br/api/v2/affiliate/generate_short_link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            app_id: appId,
            timestamp: timestamp,
            sign: sign,
            origin_url: productUrl
        })
    });
    const data = await apiReq.json();
    const affiliateLink = data.short_link;
    */

    // MOCK AFFILIATE LINK FOR DEMONSTRATION
    const affiliateLink = `https://shope.ee/${Math.random().toString(36).substring(7)}`;

    res.json({ ok: true, affiliate_link: affiliateLink });

  } catch (error: any) {
    console.error("SHOPEE_GENERATE_AFFILIATE_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/products/search', async (req, res) => {
    try {
        const { q, userId } = req.query;
        if (!q || !userId) {
            return res.status(400).json({ ok: false, error: "Query 'q' e 'userId' são obrigatórios." });
        }

        const db = await getAdminDb();
        const qs = await db.collection("ecommerce_keys")
          .where("user_id", "==", userId)
          .where("platform", "==", "shopee")
          .limit(1)
          .get();
    
        if (qs.empty) {
          return res.status(400).json({ ok: false, error: "Integração Shopee não encontrada. Configure na aba Integrações." });
        }

        // Simulação da busca de ofertas Shopee (Product Offer API)
        const mockResults = [
            {
                product_id: "shp_" + Math.floor(Math.random() * 1000000),
                title: "Shopee Oferta Especial - " + q,
                price: 99.90,
                old_price: 199.90,
                discount: "50% OFF",
                image: "https://cf.shopee.com.br/file/shopee-mock.jpg",
                product_link: "https://shopee.com.br/product/mock/" + Math.floor(Math.random() * 1000)
            }
        ];

        res.json({ ok: true, products: mockResults });

    } catch (e: any) {
        console.error("SHOPEE_SEARCH_ERROR", e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

export default router;
