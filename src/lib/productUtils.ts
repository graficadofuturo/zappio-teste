/**
 * Simplifies long SEO titles from Mercado Livre into a commercial version
 */
export function simplifyProductTitle(title: string): string {
  if (!title || title.includes("Produto Mercado Livre")) return "Produto";
  
  let short = title
    .replace(/Smartphone /gi, "")
    .replace(/Smart TV /gi, "Smart TV ")
    .replace(/Fone de Ouvido /gi, "")
    .replace(/Bluetooth /gi, "")
    .replace(/Câmera Tripla[^]*?(?=-|$)/gi, "")
    .replace(/Selfie De[^]*?(?=-|$)/gi, "")
    .replace(/Super Amoled[^]*?(?=-|$)/gi, "")
    .replace(/Recursos AI[^]*?(?=-|$)/gi, "")
    .replace(/Segurança[^]*?(?=-|$)/gi, "")
    .replace(/Snapdragon[^]*?(?=-|$)/gi, "")
    .replace(/NFC/gi, "")
    .replace(/Android/gi, "")
    .replace(/Lacrado/gi, "")
    .replace(/Novo/gi, "")
    .replace(/Original/gi, "")
    .replace(/Pronta Entrega/gi, "")
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
    .replace(/\|/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // Remove trailing separators
  short = short.replace(/[-–—/\\\]\s]+$/, "");

  // Remove repeated words
  const words = short.split(/\s+/);
  short = words.filter((word, i) => i === 0 || word.toLowerCase() !== words[i-1].toLowerCase()).join(' ');

  // Limit to 55 chars sensibly
  if (short.length > 55) {
    const parts = short.slice(0, 55).split(' ');
    if (parts.length > 1) parts.pop();
    short = parts.join(' ').trim();
    if (short.length > 52) short = short.slice(0, 52);
    short += "...";
  }

  return short || title.slice(0, 55);
}
