export class MarketplaceDetector {
  static detect(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      if (hostname.includes('mercadolivre.com.br') || hostname.includes('mercadolivre.com') || hostname.includes('meli.')) {
        return 'mercadolivre';
      }

      if (hostname.includes('amazon.com.br') || hostname.includes('amazon.com')) {
        return 'amazon';
      }

      if (hostname.includes('shopee.com.br') || hostname.includes('shopee.com')) {
        return 'shopee';
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
