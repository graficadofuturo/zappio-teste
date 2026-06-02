/**
 * Simplifies long SEO titles from Mercado Livre into a commercial version
 */
export function simplifyProductTitle(title: string): string {
  if (!title) return "";
  
  let short = title
    .replace(/Smartphone /gi, "")
    .replace(/Smart TV /gi, "Smart TV ")
    .replace(/Fone de Ouvido /gi, "")
    .replace(/Bluetooth /gi, "")
    .replace(/Câmera Tripla[^]*?(?=-|$)/gi, "")
    .replace(/Selfie De[^]*?(?=-|$)/gi, "")
    .replace(/Super Amoled[^]*?(?=-|$)/gi, "")
    .replace(/Recursos Ai[^]*?(?=-|$)/gi, "")
    .replace(/Segurança[^]*?(?=-|$)/gi, "")
    .replace(/Snapdragon[^]*?(?=-|$)/gi, "")
    .replace(/NFC/gi, "")
    .replace(/Android/gi, "")
    .replace(/Lacrado/gi, "")
    .replace(/Novo/gi, "")
    .replace(/Original/gi, "")
    .replace(/IP67/gi, "")
    .replace(/\d+GB RAM/gi, "")
    .replace(/Tela[^]*?(?=-|$)/gi, "")
    .replace(/Processador[^]*?(?=-|$)/gi, "")
    .replace(/Gaming Hub/gi, "")
    .replace(/Crystal/gi, "")
    .replace(/UHD/gi, "")
    .replace(/4K/gi, "4K")
    .replace(/ 0\.5ms/gi, "")
    .replace(/Basic Microfibra/gi, "")
    .replace(/Sem Costura/gi, "")
    .trim();

  // Remove repeated words (common in ML titles)
  const words = short.split(/\s+/);
  short = words.filter((word, i) => i === 0 || word.toLowerCase() !== words[i-1].toLowerCase()).join(' ');

  // Limit to 55 chars
  if (short.length > 55) {
    short = short.slice(0, 52) + "...";
  }

  return short || title.slice(0, 55);
}
