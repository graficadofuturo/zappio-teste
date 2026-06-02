export class UrlValidator {
  static isValid(url: string | null | undefined): boolean {
    if (!url) return false;
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  static isAffiliateUrl(url: string, provider: string): boolean {
    if (!this.isValid(url)) return false;
    
    // Very basic check - would be expanded based on specific marketplace tracking params
    if (provider === 'mercadolivre') {
      return url.includes('mercadolivre.com.br') || url.includes('lista.mercadolivre.com') || url.includes('meli.la');
    }
    if (provider === 'amazon') {
      return url.includes('amzn.to') || url.includes('amazon.com.br');
    }
    if (provider === 'shopee') {
      return url.includes('shope.ee') || url.includes('shopee.com.br');
    }
    
    return true; // Unknown provider, fallback to true if valid URL
  }
}
