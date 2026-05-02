import { Router } from "express";
import { GoogleGenAI } from "@google/genai";

const router = Router();

router.post("/generate-copy", async (req, res) => {
  try {
    const { productUrl, aiObjective, aiTone, campaignName } = req.body;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY" || process.env.GEMINI_API_KEY === "placeholder") {
      console.warn("Using mock copy because Gemini API key is missing.");
      return res.json({ variations: getFallbackMessages(campaignName, productUrl) });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `Você é um copywriter especialista em conversões via WhatsApp.
Crie 3 variações de mensagens curtas, persuasivas e naturais.

DADOS DA CAMPANHA:
Nome da Campanha: ${campaignName || 'Não especificado'}
Objetivo: ${aiObjective || 'Vender'}
Tom de Voz: ${aiTone || 'Persuasivo'}
Contexto / Oferta: ${productUrl || 'Não especificado'}

DIRETRIZES PARA AS MENSAGENS:
1. Adapte o texto ao "Objetivo" e ao "Tom de Voz".
2. Use quebras de linha para facilitar a leitura.
3. Se houver variáveis no contexto (ex: {{nome_produto}}), você pode usar para ser substituído depois, mas se não houver, crie texto fluido genérico.
4. IMPORTANTE: Use obrigatoriamente as seguintes CHAVES DINÂMICAS do Mercado Livre se a campanha for de produto, pois elas serão substituídas automaticamente pelo sistema:
   {product_title} - Nome do produto
   {product_price} - Preço (já formatado R$ XX,XX)
   {product_discount} - Porcentagem de desconto ("10% OFF")
   {product_old_price} - Preço original sem desconto
   {product_link} - O link para a página do afiliado ou o link original
5. Inclua formatações do whatsapp (*negrito*, _itálico_) em pontos chaves discretamente.
6. Seja focado em atrair a ação.
7. Retorne EXATAMENTE um array JSON contendo objetos no seguinte formato:
[
  { "title": "Nome da Variação (ex: Curta, Urgente, Direta)", "text": "Corpo da mensagem do WhatsApp" },
  { "title": "Nome da Variação 2", "text": "..." },
  { "title": "Nome da Variação 3", "text": "..." }
]`;

    let responseText = "[]";
    let retries = 2;
    let success = false;
    
    while (retries > 0 && !success) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
            }
          });
          responseText = response.text || "[]";
          const variations = JSON.parse(responseText);
          res.json({ variations });
          success = true;
        } catch (e) {
          retries--;
          if (retries === 0) {
             console.error("AI Generation failed repeatedly, using fallback:", e);
             res.json({ variations: getFallbackMessages(campaignName, productUrl) });
             success = true;
          }
        }
    }
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to generate copy" });
  }
});

function getFallbackMessages(campaignName: string, productUrl: string) {
    return [
        { title: "Versão Curta", text: `Olá! 🚀 Aproveite nossa promoção: ${campaignName}\n\n👉 ${productUrl}\n\nGaranta já!` },
        { title: "Versão Persuasiva", text: `Você não pode perder! ✨\n\nEstamos com uma condição especial na campanha *${campaignName}*.\n\nVeja todos os detalhes e aproveite antes que acabe:\n👉 ${productUrl}` },
        { title: "Versão Urgente", text: `🚨 ÚLTIMA CHANCE!\n\nAs ofertas da *${campaignName}* estão acabando.\n\nCorra e acesse o link:\n👉 ${productUrl}` }
    ];
}

export default router;
