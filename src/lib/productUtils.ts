/**
 * Simplifies long SEO titles from Mercado Livre into a commercial version
 */
export function simplifyProductTitle(title: string): string {
  if (!title || typeof title !== "string") return "Produto";
  if (title.includes("Produto Mercado Livre")) return "Produto";
  
  let short = title
    .replace(/\s+/g, " ")
    .replace(/\b(Smartphone|Smart TV|Smartwatch|Fone de Ouvido|Bluetooth|Original|Novo|Lacrado|Promoção|Oferta|Envio Full|Frete Grátis|Pronta Entrega|NFC|Android|IP67|Gaming Hub|Crystal|UHD|4K UHD)\b/gi, "")
    .replace(/Câmera Tripla[^]*?(?=-|$)/gi, "")
    .replace(/Selfie De[^]*?(?=-|$)/gi, "")
    .replace(/Super Amoled[^]*?(?=-|$)/gi, "")
    .replace(/Recursos AI[^]*?(?=-|$)/gi, "")
    .replace(/Segurança[^]*?(?=-|$)/gi, "")
    .replace(/Snapdragon[^]*?(?=-|$)/gi, "")
    .replace(/\d+GB RAM/gi, "")
    .replace(/Tela[^]*?(?=-|$)/gi, "")
    .replace(/Processador[^]*?(?=-|$)/gi, "")
    .replace(/ 0\.5ms/gi, "")
    .replace(/Basic Microfibra/gi, "")
    .replace(/Sem Costura/gi, "")
    .replace(/\|/g, "-")
    .trim();

  // Remove repeated words
  const words = short.split(/\s+/);
  short = words.filter((word, i) => i === 0 || word.toLowerCase() !== words[i-1].toLowerCase()).join(' ');

  // Limit to 50 chars for better display
  if (short.length > 50) {
    const parts = short.slice(0, 50).split(' ');
    if (parts.length > 1) parts.pop();
    short = parts.join(' ').trim();
    if (short.length > 47) short = short.slice(0, 47);
    short += "...";
  }

  return short || title.slice(0, 47) + "...";
}

/**
 * Safely format currency in BRL
 */
export function formatCurrency(value: any): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "Preço indisponível";
  }

  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}
