import axios from 'axios';
import { load } from 'cheerio';

import { getAdminFirestore } from '../api/firebaseAdmin';
import { convertMercadoLivreAffiliateLink } from '../lib/mercadolivre/mlService';

export type AffiliateLinkProvider = {
  name: string;
  convert(input: {
    uid: string;
    productUrl: string;
    marketplace: string;
    offerId?: string;
    campaignId?: string;
  }): Promise<{
    ok: boolean;
    affiliateUrl?: string;
    error?: string;
  }>;
};

// 1. SavedAffiliateLinkProvider: Reuses links already saved in Firestore
export const SavedAffiliateLinkProvider: AffiliateLinkProvider = {
  name: 'SavedLink',
  async convert({ uid, offerId, productUrl }) {
    console.log("AFFILIATE_LINK_CONVERT_START", { provider: 'SavedLink', uid, offerId });
    if (!offerId || !uid) return { ok: false };
    
    try {
      const db = getAdminFirestore();
      // Try specific user path for this offer
      const savedLinkDoc = await db.doc(`offers/${offerId}/affiliateLinks/${uid}`).get();
      
      if (savedLinkDoc.exists) {
        const data = savedLinkDoc.data();
        if (data?.affiliateUrl) {
          return { ok: true, affiliateUrl: data.affiliateUrl };
        }
      }
      
      // Fallback: Check older field format if it exists directly on offer
      const offerDoc = await db.doc(`offer_bank/${offerId}`).get();
      if (offerDoc.exists) {
        const offerData = offerDoc.data();
        if (offerData?.affiliateOwnerUid === uid && offerData?.affiliateUrl) {
          return { ok: true, affiliateUrl: offerData.affiliateUrl };
        }
      }
    } catch (error) {
      console.warn("[Affiliate] SavedProvider failed:", error);
    }
    
    return { ok: false };
  }
};

/**
 * Helper to merge Set-Cookie headers into a single cookie string
 */
function mergeCookies(oldCookieString: string, setCookieHeaders: string[] | string | null): string {
  const cookieMap = new Map<string, string>();

  // Parse old cookies
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

  // Handle setCookie string/array
  let setCookiesArr: string[] = [];
  if (typeof setCookieHeaders === 'string') {
    // Some libraries return multiple set-cookie joined by comma
    // Wait, let's just make it an array for simple strings:
    setCookiesArr = [setCookieHeaders];
  } else if (Array.isArray(setCookieHeaders)) {
    setCookiesArr = setCookieHeaders;
  }

  // Merge new cookies from Set-Cookie header
  setCookiesArr.forEach(header => {
    const firstPart = header.split(';')[0];
    const parts = firstPart.split('=');
    if (parts.length >= 2) {
      const name = parts.shift()?.trim();
      const value = parts.join('=').trim();
      
      // Handle deletion (Expired or Max-Age=0)
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
 * Technical conversion using Meli LinkBuilder Cookie Refresh logic
 */
function getCookieValue(cookieString: string, name: string): string | null {
  const match = cookieString.match(new RegExp(`(?:^|;)\\s*${name}=([^;]+)`));
  return match ? match[1] : null;
}

export async function convertMercadoLivreAffiliateLinkWithCookie(
  productUrl: string,
  uid: string,
  offerId?: string
): Promise<string | null> {
  console.log("AFFILIATE_LINK_CONVERT_START", { uid, productUrl });

  // 1. Normalizar URL
  const cleanProductUrl = normalizeMercadoLivreProductUrl(productUrl);
  console.log("AFFILIATE_CANONICAL_URL_READY", { canonical: cleanProductUrl });

  console.log("AFFILIATE_COOKIE_LOOKUP_START", { uid });
  const db = getAdminFirestore();
  const integrationPath = `users/${uid}/integrations/mercadolivre`;
  const mlDoc = await db.doc(integrationPath).get();
  
  if (!mlDoc.exists) {
    console.error("AFFILIATE_COOKIE_MISSING", { uid });
    return null;
  }

  const data = mlDoc.data() || {};
  const currentCookie = data.affiliateCookie || data.mlAffiliateCookie || data.cookie || data.cookies || '';
  const userTag = data.affiliateTag || data.mlAffiliateUserTag || data.userTag || data.tag || '';

  if (!currentCookie) {
    console.error("AFFILIATE_COOKIE_MISSING", { uid });
    return null;
  }
  if (!userTag) {
    console.error("AFFILIATE_TAG_MISSING", { uid });
    return null;
  }

  console.log("AFFILIATE_COOKIE_LOOKUP_SUCCESS", { uid, hasCookie: true, hasTag: true });
  console.log("AFFILIATE_COOKIE_REFRESH_START", { uid });

  // 3. Fazer refresh do cookie
  let refreshRes;
  try {
    refreshRes = await fetch('https://www.mercadolivre.com.br/afiliados/linkbuilder', {
      headers: {
        'cookie': currentCookie,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'referer': 'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true'
      }
    });
  } catch(e: any) {
    console.error("AFFILIATE_LINK_CONVERT_FAILED_USING_CANONICAL", { reason: e.message });
    return null;
  }

  const setCookies = refreshRes.headers.getSetCookie ? refreshRes.headers.getSetCookie() : [];
  const getContentType = refreshRes.headers.get('content-type') || '';
  let getBodyPreview = '';
  let metaCsrfToken: string | null = null;
  try {
    const text = await refreshRes.text();
    getBodyPreview = text.substring(0, 500);
    const csrfMatch = text.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
    if (csrfMatch) {
      metaCsrfToken = csrfMatch[1];
    }
  } catch(e) {}

  console.log("AFFILIATE_LINKBUILDER_GET_DEBUG", { 
    status: refreshRes.status,
    contentType: getContentType,
    redirected: refreshRes.redirected,
    finalUrl: refreshRes.url,
    setCookieCount: setCookies?.length || 0,
    hasMetaCsrf: !!metaCsrfToken,
    bodyPreviewFirst500: getBodyPreview
  });

  if (refreshRes.status === 401 || refreshRes.status === 403 || refreshRes.url.includes('login')) {
    await db.doc(integrationPath).set({
      affiliateCookieStatus: "expired",
      affiliateCookieLastError: "HTTP " + refreshRes.status,
      affiliateCookieUpdatedAt: new Date().toISOString()
    }, { merge: true });
    console.error("AFFILIATE_COOKIE_EXPIRED_RELOGIN_REQUIRED");
    console.log("AFFILIATE_LINK_CONVERT_FAILED_USING_CANONICAL", { reason: "COOKIE_EXPIRED_RELOGIN_REQUIRED" });
    return null;
  }

  // 4. Merge cookies
  const updatedCookie = mergeCookies(currentCookie, setCookies);
  console.log("AFFILIATE_COOKIE_MERGE_SUCCESS", { uid });

  // 5. Salvar cookie renovado
  await db.doc(integrationPath).set({
    affiliateCookie: updatedCookie,
    affiliateCookieStatus: "active",
    affiliateCookieUpdatedAt: new Date().toISOString()
  }, { merge: true });

  const createEndpoint = 'https://www.mercadolivre.com.br/afiliados/linkbuilder/api/create';
  console.log("AFFILIATE_CREATE_LINK_ENDPOINT_USED", { endpoint: createEndpoint });

  // 6. POST para gerar link
  console.log("AFFILIATE_CREATE_LINK_POST_START", { uid });
  let createRes;
  try {
    const postHeaders: Record<string, string> = {
      'content-type': 'application/json',
      'accept': 'application/json, text/plain, */*',
      'origin': 'https://www.mercadolivre.com.br',
      'referer': 'https://www.mercadolivre.com.br/afiliados/linkbuilder',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      'cookie': updatedCookie,
      'x-requested-with': 'XMLHttpRequest'
    };

    if (metaCsrfToken) {
      postHeaders['x-csrf-token'] = metaCsrfToken;
      postHeaders['x-csrf'] = metaCsrfToken;
    } else {
      const fallbackToken = getCookieValue(updatedCookie, "_csrf");
      if (fallbackToken) {
        postHeaders['x-csrf-token'] = fallbackToken;
        postHeaders['x-csrf'] = fallbackToken;
      }
    }

    createRes = await fetch(createEndpoint, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({
        url: cleanProductUrl,
        tag: userTag,
        _csrf: postHeaders['x-csrf-token']
      })
    });
  } catch(e: any) {
    console.error("AFFILIATE_LINK_CONVERT_FAILED_USING_CANONICAL", { reason: e.message });
    return null;
  }

  const postContentType = createRes.headers.get('content-type') || '';
  let postBodyPreview = '';
  try {
    const text = await createRes.text();
    postBodyPreview = text.substring(0, 1000);
  } catch(e) {}

  console.log("AFFILIATE_CREATE_LINK_POST_DEBUG", {
    endpoint: createEndpoint,
    status: createRes.status,
    contentType: postContentType,
    redirected: createRes.redirected,
    finalUrl: createRes.url,
    bodyPreviewFirst1000: postBodyPreview
  });

  // 8. Tratamento de Erro
  if (createRes.status === 401 || createRes.status === 403) {
    if (!postBodyPreview.includes('csrf') && !postBodyPreview.includes('unauthorized') && !postBodyPreview.includes('forbidden')) {
      await db.doc(integrationPath).set({
        affiliateCookieStatus: "expired",
        affiliateCookieLastError: "HTTP " + createRes.status,
        affiliateCookieUpdatedAt: new Date().toISOString()
      }, { merge: true });
      console.error("AFFILIATE_COOKIE_EXPIRED_RELOGIN_REQUIRED");
      console.log("AFFILIATE_LINK_CONVERT_FAILED_USING_CANONICAL", { reason: "COOKIE_EXPIRED_RELOGIN_REQUIRED" });
      return null;
    }
  }

  if (postContentType.includes('text/html')) {
    let reason = "ML_RETURNED_UNKNOWN_HTML";
    const lowerBody = postBodyPreview.toLowerCase();
    
    if (lowerBody.includes("login") || lowerBody.includes("account") || lowerBody.includes("sign in") || lowerBody.includes("entrar")) {
      reason = "ML_RETURNED_LOGIN_PAGE_COOKIE_INVALID";
    } else if (lowerBody.includes("captcha") || lowerBody.includes("robot") || lowerBody.includes("challenge") || lowerBody.includes("recaptcha")) {
      reason = "ML_RETURNED_CAPTCHA_OR_BOT_CHALLENGE";
    } else if (lowerBody.includes("not found") || lowerBody.includes("404")) {
      reason = "ML_ENDPOINT_NOT_FOUND_OR_WRONG_PATH";
    } else if (lowerBody.includes("csrf") || lowerBody.includes("forbidden") || lowerBody.includes("unauthorized") || lowerBody.includes("403")) {
      reason = "ML_CSRF_OR_AUTH_HEADER_MISSING";
    }

    console.error("AFFILIATE_LINKBUILDER_RETURNED_HTML", { reason });
    await db.doc(integrationPath).set({
      affiliateCookieLastError: reason
    }, { merge: true });
    
    console.log("AFFILIATE_LINK_CONVERT_FAILED_USING_CANONICAL", { reason });
    return null;
  }

  let resData;
  try {
    resData = JSON.parse(postBodyPreview);
  } catch(e) {
    console.error("AFFILIATE_LINK_RESPONSE_NOT_JSON");
    console.log("AFFILIATE_LINK_CONVERT_FAILED_USING_CANONICAL", { reason: "RESPONSE_NOT_JSON" });
    return null;
  }

  console.log("AFFILIATE_CREATE_LINK_RESPONSE_PREVIEW", { bodyPreview: postBodyPreview.substring(0, 500) });

  // 7. Interpretar Resposta
  let shortUrl: string | null = null;
  if (resData.short_url) shortUrl = resData.short_url;
  else if (resData.shortUrl) shortUrl = resData.shortUrl;
  else if (resData.shortened_url) shortUrl = resData.shortened_url;
  else if (resData.shortenedUrl) shortUrl = resData.shortenedUrl;
  else if (resData.url) shortUrl = resData.url;
  else if (Array.isArray(resData.urls) && resData.urls[0]) {
    const u = resData.urls[0];
    shortUrl = u.short_url || u.shortUrl || u;
  } else if (resData.data && resData.data.short_url) {
    shortUrl = resData.data.short_url;
  } else if (resData.data && Array.isArray(resData.data.urls) && resData.data.urls[0]) {
    shortUrl = resData.data.urls[0].short_url;
  } else if (Array.isArray(resData.results) && resData.results[0]?.short_url) {
    shortUrl = resData.results[0].short_url;
  }

  if (shortUrl && (shortUrl.includes('meli.la') || shortUrl !== cleanProductUrl)) {
    console.log("AFFILIATE_LINK_METHOD_SELECTED", { method: "cookie_linkbuilder" });
    console.log("AFFILIATE_LINK_CONVERT_SUCCESS", { url: shortUrl });
    
    if (offerId) {
      await db.doc(`offers/${offerId}/affiliateLinks/${uid}`).set({
        originalUrl: productUrl,
        canonicalUrl: cleanProductUrl,
        affiliateUrl: shortUrl,
        tag: userTag,
        marketplace: "mercadolivre",
        method: "cookie_linkbuilder",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
    return shortUrl;
  }

  console.error("AFFILIATE_LINK_RESPONSE_WITHOUT_SHORT_URL");
  console.log("AFFILIATE_LINK_CONVERT_FAILED_USING_CANONICAL", { reason: "AFFILIATE_LINK_RESPONSE_WITHOUT_SHORT_URL" });
  return null;
}

// 2.2 CookieLinkBuilderProvider: Uses Cookie Refresh method
export const CookieLinkBuilderProvider: AffiliateLinkProvider = {
  name: 'cookie_linkbuilder',
  async convert({ uid, productUrl, marketplace, offerId }) {
    const isML = isMercadoLivreUrl(productUrl) || 
                 marketplace?.toLowerCase().includes('mercadolivre') || 
                 marketplace?.toLowerCase().includes('mercado_livre') || 
                 marketplace?.toLowerCase().includes('mercado livre');
    
    if (!isML) return { ok: false };

    console.log("AFFILIATE_LINK_CONVERT_START", { provider: 'cookie_linkbuilder', uid });
    
    const cleanProductUrl = normalizeMercadoLivreProductUrl(productUrl);
    const db = getAdminFirestore(); const mlDoc = await db.doc('users/' + uid + '/integrations/mercadolivre').get(); let currentCookie = ''; let currentTag = ''; if (mlDoc.exists) { const data = mlDoc.data() || {}; currentCookie = data.affiliateCookie || data.mlAffiliateCookie || data.cookie || data.cookies || ''; currentTag = data.affiliateTag || data.mlAffiliateUserTag || data.userTag || data.tag || ''; } const affiliateUrl = await convertToAffiliateLink(cleanProductUrl, uid); if (affiliateUrl && affiliateUrl !== cleanProductUrl && offerId) { try { await db.doc('offers/' + offerId + '/affiliateLinks/' + uid).set({ originalUrl: productUrl, canonicalUrl: cleanProductUrl, affiliateUrl: affiliateUrl, marketplace: 'mercadolivre', method: 'cookie_linkbuilder_axios', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true }); } catch(e) {} }
    
    if (affiliateUrl) {
      return { ok: true, affiliateUrl };
    }
    
    return { ok: false };
  }
};

/**
 * Builds affiliate URL using a pre-defined pattern from environment variables
 */
export async function buildMercadoLivreAffiliateLink(
  canonicalProductUrl: string, 
  uid: string
): Promise<string | null> {
  console.log("AFFILIATE_LINK_CONVERT_START", { provider: 'env_pattern', uid });

  const pattern = process.env.ML_AFFILIATE_LINK_PATTERN;
  const globalAffiliateId = process.env.ML_AFFILIATE_ID || process.env.ML_AFFILIATE_USER_TAG;
  
  if (!pattern || !pattern.includes('{')) {
    console.log("AFFILIATE_LINK_PATTERN_ENV_MISSING_OR_INVALID");
    return null;
  }

  console.log("AFFILIATE_LINK_PATTERN_ENV_FOUND", { 
    hasPattern: true, 
    hasAffiliateId: !!globalAffiliateId 
  });

  try {
    const db = getAdminFirestore();
    const mlIntg = await db.doc(`users/${uid}/integrations/mercadolivre`).get();
    let userAffiliateId = globalAffiliateId;
    
    // Try to get specific user affiliate ID if available in integration
    if (mlIntg.exists) {
      const data = mlIntg.data();
      userAffiliateId = data?.affiliateId || data?.affiliate_id || data?.userTag || data?.user_tag || userAffiliateId;
    }

    // Placeholders mapping
    const replacements: Record<string, string> = {
      '{product_url}': canonicalProductUrl,
      '{url}': canonicalProductUrl,
      '{encoded_product_url}': encodeURIComponent(canonicalProductUrl),
      '{encoded_url}': encodeURIComponent(canonicalProductUrl),
      '{affiliate_id}': userAffiliateId || '',
      '{user_tag}': userAffiliateId || '',
      '{ml_affiliate_id}': userAffiliateId || '',
      '{ml_affiliate_user_tag}': userAffiliateId || ''
    };

    let affiliateUrl = pattern;
    for (const [placeholder, value] of Object.entries(replacements)) {
      // Use case-insensitive global replacement
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      affiliateUrl = affiliateUrl.replace(regex, value);
    }

    console.log("AFFILIATE_LINK_METHOD_SELECTED", {
      method: "env_pattern",
      originalUrl: canonicalProductUrl,
      canonicalUrl: canonicalProductUrl,
      finalUrl: affiliateUrl
    });
      
    console.log("AFFILIATE_LINK_FINAL_URL", { isAffiliate: true });
    return affiliateUrl;
  } catch (e) {
    console.error("[Affiliate] Pattern builder error:", e);
    return null;
  }
}

// Backward compatibility alias
export const buildMercadoLivreAffiliateUrlFromPattern = buildMercadoLivreAffiliateLink;

// 2.5 EnvPatternProvider: Uses a template pattern from ENV to build links
export const EnvPatternProvider: AffiliateLinkProvider = {
  name: 'env_pattern',
  async convert({ uid, productUrl, marketplace }) {
    const isML = isMercadoLivreUrl(productUrl) || 
                 marketplace?.toLowerCase().includes('mercadolivre') || 
                 marketplace?.toLowerCase().includes('mercado_livre') || 
                 marketplace?.toLowerCase().includes('mercado livre');
    
    if (!isML) return { ok: false };
    
    const affiliateUrl = await buildMercadoLivreAffiliateLink(productUrl, uid);
    
    if (affiliateUrl) {
      return { ok: true, affiliateUrl };
    }
    
    return { ok: false };
  }
};

// 3. ExternalAuthorizedProvider: Uses external API if configured
export const ExternalAuthorizedProvider: AffiliateLinkProvider = {
  name: 'external_provider',
  async convert({ uid, productUrl, marketplace, offerId }) {
    console.log("AFFILIATE_LINK_CONVERT_START", { provider: 'external_provider', uid, offerId });
    const apiUrl = process.env.AFFILIATE_CONVERTER_API_URL;
    const apiKey = process.env.AFFILIATE_CONVERTER_API_KEY;

    console.log("AFFILIATE_EXTERNAL_PROVIDER_CONFIG_CHECK", { 
      hasUrl: !!apiUrl, 
      hasKey: !!apiKey 
    });

    if (!apiUrl) {
      console.log("AFFILIATE_EXTERNAL_PROVIDER_DISABLED");
      return { ok: false };
    }

    console.log("AFFILIATE_EXTERNAL_PROVIDER_REQUEST_START", { 
      uid, 
      marketplace: marketplace?.includes('mercadolivre') ? 'mercadolivre' : marketplace 
    });

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey || ''}`
        },
        body: JSON.stringify({ 
          uid, 
          productUrl, 
          marketplace: marketplace?.includes('mercadolivre') ? 'mercadolivre' : marketplace 
        })
      });

      console.log("AFFILIATE_EXTERNAL_PROVIDER_RESPONSE_STATUS", { status: response.status });

      if (!response.ok) {
        console.error("AFFILIATE_EXTERNAL_PROVIDER_FAILED", { status: response.status, uid });
        return { ok: false };
      }

      const data = await response.json();
      if (data?.ok === true && data?.affiliateUrl) {
        console.log("AFFILIATE_EXTERNAL_PROVIDER_SUCCESS", { uid });
        return { ok: true, affiliateUrl: data.affiliateUrl };
      }
      
      console.warn("external_provider_failed", { reason: "No affiliateUrl or ok=false in response", uid });
      console.log("AFFILIATE_EXTERNAL_PROVIDER_FAILED", { reason: "Invalid response body", uid });
    } catch (error: any) {
      console.error("external_provider_failed", { error: error.message, uid });
      console.error("AFFILIATE_EXTERNAL_PROVIDER_FAILED", { error: error.message, uid });
    }

    return { ok: false };
  }
};

// 4. ManualFallbackProvider: Final check, always returns false to trigger fallback to original
export const ManualFallbackProvider: AffiliateLinkProvider = {
  name: 'ManualFallback',
  async convert() {
    return { ok: false };
  }
};

/**
 * Helper to identify Mercado Livre URLs correctly
 */
export function isMercadoLivreUrl(url: string): boolean {
  if (!url) return false;
  const mlDomains = [
    'mercadolivre.com.br',
    'mercadolibre.com.ar',
    'mercadolibre.com',
    'mercadolibre.cl',
    'mercadolibre.com.mx'
  ];
  try {
    const urlObj = new URL(url);
    return mlDomains.some(domain => urlObj.hostname.includes(domain));
  } catch (e) {
    return false;
  }
}

/**
 * Removes ALL tracking parameters and fragments from Mercado Livre URLs
 * Handles both produto.mercadolivre.com.br and www.mercadolivre.com.br formats
 */
export function normalizeMercadoLivreProductUrl(url: string): string {
  if (!url) return url;
  
  try {
    if (!isMercadoLivreUrl(url)) return url;

    const urlObj = new URL(url);
    
    // Aggressive normalization: remove ALL query parameters and the hash
    // This removes tracking_id, deal_print_id, position, searchVariation, etc.
    const cleanUrl = urlObj.origin + urlObj.pathname;
    
    console.log("PRODUCT_URL_NORMALIZED", { original: url, normalized: cleanUrl });
    return cleanUrl;
  } catch (e) {
    return url;
  }
}

/**
 * Main resolution function
 */
export async function resolveAffiliateLinkForSending({
  uid,
  productUrl,
  marketplace,
  offerId,
  campaignId
}: {
  uid: string;
  productUrl: string;
  marketplace: string;
  offerId: string;
  campaignId?: string;
}): Promise<string> {
  // Detailed UID resolution logging
  console.log("AFFILIATE_LINK_OWNER_UID_RESOLVED", {
    campaignId: campaignId || null,
    receivedUid: uid || null,
    ownerUid: uid
  });

  console.log("AFFILIATE_LINK_RESOLVE_START", { uid, offerId, marketplace, campaignId });

  if (!productUrl) {
    console.warn("[Affiliate] No productUrl provided");
    return "";
  }

  // 1. Normalize if it's ML
  const isMLCandidate = isMercadoLivreUrl(productUrl) || 
                        marketplace?.toLowerCase().includes('mercadolivre') || 
                        marketplace?.toLowerCase().includes('mercado_livre') || 
                        marketplace?.toLowerCase().includes('mercado livre');
  
  const canonicalUrl = isMLCandidate ? normalizeMercadoLivreProductUrl(productUrl) : productUrl;

  // Chain of providers - Priority order:
  // 1. Saved/Cached link
  // 2. Cookie LinkBuilder (Primary Meli method)
  // 3. Env Pattern (Optional fallback)
  // 4. External API
  const providers = [
    SavedAffiliateLinkProvider,
    CookieLinkBuilderProvider,
    EnvPatternProvider,
    ExternalAuthorizedProvider,
    ManualFallbackProvider
  ];

  for (const provider of providers) {
    // Attempt conversion using canonical URL
    const result = await provider.convert({ 
        uid, 
        productUrl: canonicalUrl, 
        marketplace, 
        offerId,
        campaignId 
    });
    
    if (result.ok && result.affiliateUrl) {
      console.log("AFFILIATE_LINK_METHOD_SELECTED", {
        method: provider.name,
        isAffiliate: true,
        finalUrl: result.affiliateUrl,
        reason: `Successfully converted using ${provider.name}`,
        uid
      });

      // If it's a new link from external provider, pattern builder or cookie linkbuilder, save it
      if (provider.name === 'external_provider' || provider.name === 'env_pattern' || provider.name === 'cookie_linkbuilder' || provider.name === 'DirectMercadoLivre') {
        try {
          const db = getAdminFirestore();
          await db.doc(`offers/${offerId}/affiliateLinks/${uid}`).set({
            uid,
            marketplace,
            productUrl: canonicalUrl,
            productUrlOriginal: productUrl,
            canonicalProductUrl: canonicalUrl,
            affiliateUrl: result.affiliateUrl,
            source: provider.name,
            affiliateMethod: provider.name,
            affiliateConvertedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          console.error("[Affiliate] Error saving new link:", e);
        }
      }

      const typeLabel = provider.name === 'SavedLink' ? 'affiliate_cached' : 'affiliate';
      console.log("AFFILIATE_LINK_FINAL", { type: typeLabel, uid, url: result.affiliateUrl });
      return result.affiliateUrl;
    }
  }

  console.log("AFFILIATE_LINK_METHOD_SELECTED", {
    method: "canonical_fallback",
    isAffiliate: false,
    finalUrl: canonicalUrl,
    reason: "All affiliate conversion methods failed or none were applicable",
    uid
  });

  if (isMLCandidate && process.env.REQUIRE_AFFILIATE_LINK_FOR_ML === "true") {
    console.error("AFFILIATE_LINK_REQUIRED_BUT_CONVERSION_FAILED", { reason: "Missing affiliate URL for ML", uid });
    throw new Error("AFFILIATE_LINK_REQUIRED_BUT_CONVERSION_FAILED: Link afiliado do Mercado Livre é obrigatório mas a conversão falhou.");
  }

  console.log("AFFILIATE_LINK_CONVERT_FAILED_USING_CANONICAL", { uid, offerId, fallback: canonicalUrl });
  console.log("AFFILIATE_LINK_FINAL", { type: 'original_normalized', uid, url: canonicalUrl });
  return canonicalUrl;
}

export async function convertToAffiliateLink(url: string, uid: string): Promise<string> {  try {    const baseUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:3000';    const res = await fetch(baseUrl + '/api/mercadolivre/create-affiliate-link', {      method: 'POST',      headers: { 'Content-Type': 'application/json' },      body: JSON.stringify({ url, uid })    });    const json = await res.json();    return json.ok ? json.affiliateUrl : url;  } catch(e) {    return url;  }}
