/**
 * Mercado Livre Affiliate Link Service
 * Uses cookie-based Link Builder API to convert product URLs to meli.la affiliate links.
 * Falls back to deeplink pattern if cookie is expired, missing, or API call fails.
 */

interface AffiliateLinkResult {
  ok: boolean;
  affiliateUrl: string;
  method: 'api' | 'cookie_linkbuilder' | 'deeplink' | 'fallback';
  error?: string;
}

/**
 * Extracts the ML item ID from a product URL.
 * Handles formats like:
 * - https://www.mercadolivre.com.br/produto/MLB123456789
 * - https://produto.mercadolivre.com.br/MLB-123456789-...
 * - https://www.mercadolivre.com.br/p/MLB123456789
 */
export function extractMLItemId(url: string): string | null {
  if (!url) return null;
  
  const patterns = [
    /MLB[\-]?(\d+)/i,
    /\/p\/(MLB\d+)/i,
    /produto\.mercadolivre\.com\.br\/(MLB[\-]\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1].replace('-', '') || match[0].replace('-', '');
    }
  }
  
  return null;
}

/**
 * Merges old cookie string with new set-cookie headers.
 */
function mergeCookies(oldCookieString: string, setCookieHeaders: string[] | string | null): string {
  const cookieMap = new Map<string, string>();

  if (oldCookieString) {
    oldCookieString.split(';').forEach(c => {
      const parts = c.trim().split('=');
      if (parts.length >= 2) {
        const name = parts.shift()?.trim();
        const value = parts.join('=').trim();
        if (name) cookieMap.set(name, value);
      }
    });
  }

  let setCookiesArr: string[] = [];
  if (typeof setCookieHeaders === 'string') {
    setCookiesArr = [setCookieHeaders];
  } else if (Array.isArray(setCookieHeaders)) {
    setCookiesArr = setCookieHeaders;
  }

  setCookiesArr.forEach(header => {
    const firstPart = header.split(';')[0];
    const parts = firstPart.split('=');
    if (parts.length >= 2) {
      const name = parts.shift()?.trim();
      const value = parts.join('=').trim();
      const isDelete = header.includes('Max-Age=0') || 
                      header.toLowerCase().includes('expires=thu, 01 jan 1970');
      
      if (name && isDelete) {
        cookieMap.delete(name);
      } else if (name) {
        cookieMap.set(name, value);
      }
    }
  });

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * Helper to get a cookie value from a cookie string.
 */
function getCookieValue(cookieString: string, name: string): string | null {
  const match = cookieString.match(new RegExp(`(?:^|;)\\s*${name}=([^;]+)`));
  return match ? match[1] : null;
}

/**
 * Normalizes Mercado Livre product URL to its canonical form (no query params).
 */
export function normalizeMLProductUrl(url: string): string {
  if (!url) return url;
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    return url;
  }
}

/**
 * Performs conversion using user's browser session cookies.
 */
async function convertMLWithCookie(
  productUrl: string,
  currentCookie: string,
  userTag: string,
  userId: string,
  db: any
): Promise<string | null> {
  const cleanProductUrl = normalizeMLProductUrl(productUrl);
  console.log(`[MLAffiliate] convertMLWithCookie - Canonical URL: ${cleanProductUrl}`);

  // 1. Refresh cookies by visiting Link Builder page
  let refreshRes;
  try {
    refreshRes = await fetch('https://www.mercadolivre.com.br/afiliados/linkbuilder', {
      headers: {
        'cookie': currentCookie,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'referer': 'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true'
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch (e: any) {
    console.error("[MLAffiliate] Cookie refresh network request failed:", e.message);
    return null;
  }

  console.log(`[MLAffiliate] Refresh status: ${refreshRes.status}, redirected to: ${refreshRes.url}`);

  if (refreshRes.status === 401 || refreshRes.status === 403 || refreshRes.url.includes('login')) {
    console.error(`[MLAffiliate] Session expired. Cookie status updated to expired.`);
    await db.doc(`users/${userId}/integrations/mercadolivre`).set({
      affiliateCookieStatus: "expired",
      affiliateCookieLastError: `HTTP ${refreshRes.status} during refresh`,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return null;
  }

  // Parse updated cookies & CSRF token from page HTML
  const setCookies = refreshRes.headers.getSetCookie ? refreshRes.headers.getSetCookie() : [];
  const text = await refreshRes.text();
  let metaCsrfToken: string | null = null;
  const csrfMatch = text.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
  if (csrfMatch) {
    metaCsrfToken = csrfMatch[1];
  }

  const updatedCookie = mergeCookies(currentCookie, setCookies);

  // Update cookie in Firestore
  await db.doc(`users/${userId}/integrations/mercadolivre`).set({
    affiliateCookie: updatedCookie,
    affiliateCookieStatus: "active",
    updatedAt: new Date().toISOString()
  }, { merge: true });

  // 2. POST to Link Builder API to shorten link
  const createEndpoint = 'https://www.mercadolivre.com.br/afiliados/linkbuilder/api/create';
  const csrfToken = metaCsrfToken || getCookieValue(updatedCookie, "_csrf") || "";
  
  const postHeaders: Record<string, string> = {
    'content-type': 'application/json',
    'accept': 'application/json, text/plain, */*',
    'origin': 'https://www.mercadolivre.com.br',
    'referer': 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'cookie': updatedCookie,
    'x-requested-with': 'XMLHttpRequest'
  };

  if (csrfToken) {
    postHeaders['x-csrf-token'] = csrfToken;
    postHeaders['x-csrf'] = csrfToken;
  }

  let createRes;
  try {
    createRes = await fetch(createEndpoint, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({
        url: cleanProductUrl,
        tag: userTag,
        _csrf: csrfToken
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (e: any) {
    console.error("[MLAffiliate] Create API network request failed:", e.message);
    return null;
  }

  console.log(`[MLAffiliate] Create API response status: ${createRes.status}`);

  if (createRes.status === 401 || createRes.status === 403) {
    console.error(`[MLAffiliate] Create API request unauthorized.`);
    return null;
  }

  const postText = await createRes.text();
  let resData: any;
  try {
    resData = JSON.parse(postText);
  } catch (e) {
    console.error("[MLAffiliate] Create API returned non-JSON response:", postText.substring(0, 200));
    return null;
  }

  let shortUrl: string | null = null;
  if (resData.short_url) shortUrl = resData.short_url;
  else if (resData.shortUrl) shortUrl = resData.shortUrl;
  else if (resData.url) shortUrl = resData.url;
  else if (resData.data && resData.data.short_url) shortUrl = resData.data.short_url;
  else if (resData.results && resData.results[0] && resData.results[0].short_url) shortUrl = resData.results[0].short_url;

  return shortUrl;
}

/**
 * Converts a Mercado Livre product URL to an affiliate link.
 */
export async function convertToMLAffiliateLink(
  productUrl: string,
  accessToken: string,
  affiliateTag: string | null,
  mlUserId?: string | number
): Promise<AffiliateLinkResult> {
  if (!productUrl) {
    return { ok: false, affiliateUrl: productUrl, method: 'fallback', error: 'No URL provided' };
  }
  
  const itemId = extractMLItemId(productUrl);
  
  // === Method 1: Official ML Affiliates API (Legacy / Seller app context) ===
  if (accessToken && itemId && mlUserId) {
    try {
      const apiUrl = `https://api.mercadolibre.com/affiliate-link?item_id=${itemId}&app_id=${process.env.ML_CLIENT_ID || ''}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data: any = await response.json();
        if (data.short_url || data.affiliate_url || data.link) {
          const finalUrl = data.short_url || data.affiliate_url || data.link;
          return { ok: true, affiliateUrl: finalUrl, method: 'api' };
        }
      }
    } catch (e: any) {
      console.log('[MLAffiliate] API method failed:', e.message);
    }
  }
  
  // === Method 2: Deeplink with affiliate tag ===
  if (affiliateTag && itemId) {
    try {
      const cleanItemId = itemId.replace('MLB', '');
      const deeplink = `https://www.mercadolivre.com.br/l/MLB${cleanItemId}?affiliate_id=${affiliateTag}&source=zappio`;
      return { ok: true, affiliateUrl: deeplink, method: 'deeplink' };
    } catch (e: any) {
      console.log('[MLAffiliate] Deeplink method failed:', e.message);
    }
  }
  
  return {
    ok: false,
    affiliateUrl: productUrl,
    method: 'fallback',
    error: 'Could not generate affiliate link - no valid token or tag'
  };
}

/**
 * High-level function to convert a URL using credentials from Firestore.
 * Handles Cookie-based API resolution and falls back to Deeplink/API methods.
 */
export async function convertURLWithFirestoreCredentials(
  productUrl: string,
  userId: string,
  db: any
): Promise<AffiliateLinkResult> {
  try {
    const { createAffiliateLinkFromFirestore } = await import('../../../api_handlers/_lib/ml-utils.js');
    console.log(`[MLAffiliate] Delegating conversion to createAffiliateLinkFromFirestore for url: ${productUrl}, uid: ${userId}`);
    const result = await createAffiliateLinkFromFirestore(productUrl, userId, db);
    
    if (result.ok && result.short_url) {
      return {
        ok: true,
        affiliateUrl: result.short_url,
        method: 'cookie_linkbuilder'
      };
    }
    
    console.warn(`[MLAffiliate] Cookie-based conversion failed, falling back to deeplink. Error:`, result.error);

    // Fallback: Try Deeplink with affiliate tag if possible
    const itemId = extractMLItemId(productUrl);
    const mlDocSnap = await db.doc(`users/${userId}/integrations/mercadolivre`).get();
    let affiliateTag = null;
    if (mlDocSnap.exists) {
      const mlData = mlDocSnap.data();
      affiliateTag = mlData?.affiliateTag || mlData?.userTag || null;
    }
    
    if (itemId && affiliateTag) {
      const cleanItemId = itemId.replace('MLB', '');
      const deeplink = `https://produto.mercadolivre.com.br/MLB-${cleanItemId}?affiliate_id=${affiliateTag}`;
      return {
        ok: true,
        affiliateUrl: deeplink,
        method: 'deeplink'
      };
    }
    
    return {
      ok: false,
      affiliateUrl: productUrl,
      method: 'fallback',
      error: result.error || 'Conversion failed and no fallback possible'
    };
  } catch (e: any) {
    console.error('[MLAffiliate] Firestore credential lookup failed:', e.message);
    return { ok: false, affiliateUrl: productUrl, method: 'fallback', error: e.message };
  }
}
