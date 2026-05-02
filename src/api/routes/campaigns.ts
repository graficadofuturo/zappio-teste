import { Router } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { getRandomKeyword, CAMPAIGN_CATEGORIES } from "../campaignService.ts";
import { GoogleGenAI } from "@google/genai";

const router = Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Utility to fetch products from ML directly
async function fetchMLProductsByKeyword(keyword: string): Promise<any[]> {
    const mlRes = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(keyword)}&limit=50`);
    if (!mlRes.ok) return [];
    const data = await mlRes.json();
    return data.results || [];
}

router.get("/:id/preview-offer", async (req, res) => {
    try {
        const { category } = req.query;
        const cat = typeof category === 'string' ? category : 'Todos';
        const keyword = getRandomKeyword(cat);
        const results = await fetchMLProductsByKeyword(keyword);
        
        if (results.length === 0) {
            res.status(404).json({ error: "Nenhum produto encontrado na categoria especificada." });
            return;
        }
        
        const mlItem = results[Math.floor(Math.random() * results.length)];
        const product = {
            id: mlItem.id,
            external_product_id: mlItem.id,
            product_title: mlItem.title,
            product_price: mlItem.price,
            product_old_price: mlItem.original_price,
            product_discount: mlItem.original_price && mlItem.price < mlItem.original_price ? Math.round((1 - (mlItem.price / mlItem.original_price)) * 100) + '%' : null,
            product_link: mlItem.permalink,
            product_image: mlItem.thumbnail?.replace('-I.jpg', '-O.jpg').replace('-I.webp', '-O.webp') || null,
            product_category: cat
        };

        res.json({ product });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.post("/:id/generate-copy", async (req, res) => {
    try {
        const { category, product, tone, template } = req.body;
        
        const prompt = `Atue como um copywriter profissional de alta conversão. Você deve gerar o texto de uma oferta para WhatsApp seguindo a exata estrutura do template fornecido pelo usuário.
        
Seu objetivo é gerar o TEXTO, mantendo as VARIÁVEIS (ex: {product_link}, {product_price}, etc.) no texto para que o sistema as substitua depois, OU substituí-las se preferir, mas como é para gerar um TEMPLATE ou TEXTO para o cliente aprovar, você deve retornar um texto com cara de WhatsApp usando os dados do produto se o usuário solicitou isso, ou manter as variáveis.
O usuário quer gerar a copy JÁ COM OS DADOS do produto para preview, ou um template melhor. 

Na instrução: A IA não deve inventar preço, estoque etc.

DADOS DA MENSAGEM:
Categoria: ${category}
Tom da Copy: ${tone}
Produto de Exemplo (se aplicável): ${product?.product_title || 'Nenhum'}
Preço Real: ${product?.product_price || 'Nenhum'}

ESTRUTURA DESEJADA PELO USUÁRIO:
${template || 'Nenhum'}

INSTRUÇÕES:
- Melhore a copy, deixando mais persuasiva de acordo com o Tom.
- Se o usuário forneceu um produto, use os dados reais do produto no lugar das variáveis no resultado! Ou seja, insira o título, preço, link dele.
- Se tiver um link, insira-o.
- Seja curto, use emojis, parágrafos curtos.
- NÃO invente descontos ou estoques se não existir.

Retorne APENAS o texto da mensagem final. Sem tags markdown block de código, sem comentários.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: prompt
        });

        const copy = response.text;
        res.json({ copy });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.get("/categories", (req, res) => {
    res.json(Object.keys(CAMPAIGN_CATEGORIES));
});

export default router;
