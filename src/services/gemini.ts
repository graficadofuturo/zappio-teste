import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export const generateCopy = async (instruction: string, currentText: string, tone?: string) => {
  const model = "gemini-3-flash-preview";
  
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
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction
    }
  });

  return response.text || "";
};

export const generateVariations = async (text: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `Gere 3 variações curtas e persuasivas para esta mensagem de venda no WhatsApp: "${text}". Retorne apenas as variações separadas por "---".`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: "Você é um copywriter. Retorne apenas as 3 variações separadas por ---"
    }
  });

  const variations = (response.text || "").split('---').map(v => v.trim()).filter(v => v.length > 0);
  return variations;
};
