import { Router } from "express";
import { GoogleGenAI } from "@google/genai";

const router = Router();

// Lazy initialization of Gemini
let genAI: GoogleGenAI | null = null;

function getAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada no servidor.");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

router.post("/generate-copy", async (req, res) => {
  const { instruction, currentText, tone } = req.body;

  try {
    const ai = getAI();
    
    const systemInstruction = `
      Você é um Expert em Copyright (Copywriter Profissional).
      Seu objetivo é criar/melhorar mensagens para vendas no WhatsApp.
      Mantenha um tom persuasivo, use emojis adequadamente e foque em conversão.
      Sempre retorne APENAS o texto final da mensagem, sem explicações.
      
      Regras de formatação para WhatsApp:
      - Negrito: *texto*
      - Itálico: _texto_
      - Riscado: ~texto~
      - Use quebras de linha para facilitar a leitura.
    `;

    const prompt = `
      Instrução: ${instruction}
      ${tone ? `Tom: ${tone}` : ""}
      Texto Atual: ${currentText}
      
      Melhore este texto ou gere um novo baseado na instrução acima.
      
      ${systemInstruction}
    `;

    const result = await (ai as any).models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
    });

    res.status(200).json({ ok: true, text: result.text || "" });
  } catch (error: any) {
    console.error("AI_GENERATE_COPY_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/generate-variations", async (req, res) => {
  const { text } = req.body;

  try {
    const ai = getAI();
    const prompt = `Gere 3 variações curtas e persuasivas para esta mensagem de venda no WhatsApp: "${text}". Retorne apenas as variações separadas por "---".`;

    const result = await (ai as any).models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt
    });
    
    const output = result.text || "";
    const variations = output.split('---').map((v: string) => v.trim()).filter((v: string) => v.length > 0);
    
    res.status(200).json({ ok: true, variations });
  } catch (error: any) {
    console.error("AI_GENERATE_VARIATIONS_ERROR", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
