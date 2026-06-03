import * as cheerio from 'cheerio';
import { getAdminDb } from './firebase-admin.js';
import axios from 'axios';
import { simplifyProductTitle } from '../../src/lib/productUtils.js';

// Helper to refresh a token and save it to Firestore
async function refreshAccessTokenIfExpired(
  docPath: string,
  mlData: any
): Promise<string | null> {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn(`[ML-UTILS] Missing ML_CLIENT_ID or ML_CLIENT_SECRET, cannot refresh token.`);
    return mlData.accessToken; // return current token as fallback
  }

  const refreshToken = mlData.refreshToken;
  if (!refreshToken || refreshToken.startsWith('mock')) {
    console.warn(`[ML-UTILS] No valid refresh token for ${docPath}.`);
    return mlData.accessToken;
  }

  // Check if it's actually expired.
  // expiresIn is in seconds (normally 21600 = 6 hours).
  const connectedAtMs = mlData.connectedAt ? new Date(mlData.connectedAt).getTime() : new Date(mlData.updatedAt || Date.now()).getTime();
  const expiresInMs = (mlData.expiresIn || 21600) * 1000;
  const bufferMs = 15 * 60 * 1000; // 15 minutes buffer
  const now = Date.now();

  const isExpired = (now - connectedAtMs) >= (expiresInMs - bufferMs);
  if (!isExpired) {
    // Token is still valid, return it
    return mlData.accessToken;
  }

  console.log(`[ML-UTILS] Token for ${docPath} is expired or expiring soon. Refreshing...`);

  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    });

    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ML-UTILS] Failed to refresh token for ${docPath}:`, errText);
      return mlData.accessToken; // return current as fallback
    }

    const tokenData = await response.json();
    console.log(`[ML-UTILS] Token refreshed successfully for ${docPath}! Expires in:`, tokenData.expires_in);

    const db = getAdminDb();
    const updatedFields = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken, // fallback to old one if not returned
      expiresIn: tokenData.expires_in,
      updatedAt: new Date().toISOString(),
      connectedAt: new Date().toISOString(), // update connection timestamp
    };

    await db.doc(docPath).set(updatedFields, { merge: true });

    // If it was a user document, and we also have a global document, let's sync them to avoid mismatch!
    if (docPath.startsWith('users/')) {
      await db.doc('marketplace_integrations/mercadolivre').set(updatedFields, { merge: true });
    } else if (docPath === 'marketplace_integrations/mercadolivre') {
      // If we refreshed the global one, let's also sync to users/default_user or the stored uid if present
      const uid = mlData.uid || 'default_user';
      await db.doc(`users/${uid}/integrations/mercadolivre`).set(updatedFields, { merge: true });
    }

    return tokenData.access_token;
  } catch (err: any) {
    console.error(`[ML-UTILS] Error refreshing token for ${docPath}:`, err.message);
    return mlData.accessToken;
  }
}

async function getMlAccessToken(uid?: string | null): Promise<string | null> {
  const db = getAdminDb();
  if (uid) {
    const docPath = `users/${uid}/integrations/mercadolivre`;
    const mlSnap = await db.doc(docPath).get();
    if (mlSnap.exists) {
      const mlData = mlSnap.data();
      if (mlData && mlData.connected && mlData.accessToken && !mlData.accessToken.startsWith('mock')) {
        return refreshAccessTokenIfExpired(docPath, mlData);
      }
    }
  }
  
  // Try global path
  try {
    const docPath = `marketplace_integrations/mercadolivre`;
    const globalSnap = await db.doc(docPath).get();
    if (globalSnap.exists) {
      const mlData = globalSnap.data();
      if (mlData && mlData.connected && mlData.accessToken && !mlData.accessToken.startsWith('mock')) {
        return refreshAccessTokenIfExpired(docPath, mlData);
      }
    }
  } catch (e) {}

  // Fallback: search for any connected integration with a real access token
  try {
    const usersSnap = await db.collection("users").get();
    for (const doc of usersSnap.docs) {
       const docPath = `users/${doc.id}/integrations/mercadolivre`;
       const mlSnap = await db.doc(docPath).get();
       if (mlSnap.exists) {
          const mlData = mlSnap.data();
          if (mlData && mlData.connected && mlData.accessToken && !mlData.accessToken.startsWith('mock')) {
             return refreshAccessTokenIfExpired(docPath, mlData);
          }
       }
    }
  } catch (e) {}
  return null;
}

async function getMlCookies(uid?: string | null): Promise<string | null> {
  const db = getAdminDb();
  if (uid) {
    const mlSnap = await db.doc(`users/${uid}/integrations/mercadolivre`).get();
    if (mlSnap.exists) {
      const mlData = mlSnap.data();
      if (mlData && (mlData.affiliateCookie || mlData.cookie)) {
        return mlData.affiliateCookie || mlData.cookie;
      }
    }
  }

  // Try global path
  try {
    const globalSnap = await db.doc("marketplace_integrations/mercadolivre").get();
    if (globalSnap.exists) {
      const mlData = globalSnap.data();
      if (mlData && (mlData.affiliateCookie || mlData.cookie)) {
        return mlData.affiliateCookie || mlData.cookie;
      }
    }
  } catch (e) {}
  
  // Fallback: search for any user with cookies
  try {
    const usersSnap = await db.collection("users").get();
    for (const doc of usersSnap.docs) {
       const mlSnap = await db.doc(`users/${doc.id}/integrations/mercadolivre`).get();
       if (mlSnap.exists) {
          const mlData = mlSnap.data();
          if (mlData && (mlData.affiliateCookie || mlData.cookie)) {
             return mlData.affiliateCookie || mlData.cookie;
          }
       }
    }
  } catch (e) {}
  return null;
}

// --- Affiliate Regex Extraction ---
export function extractAffiliateTag(htmlOrScript) {
  const matchers = [
    /"siteId"\s*:\s*"(MLB\d+)"/,
    /siteId\s*=\s*['"](MLB\d+)['"]/,
    /mercado\s*livre\s*afiliados.*?(MLB\d+)/i,
    /data-affiliate-id\s*=\s*['"](MLB\d+)['"]/,
    /['"]?campaignId['"]?\s*[:=]\s*['"]?(MLB\d+)['"]?/i,
    /['"]?affiliateId['"]?\s*[:=]\s*['"]?(MLB\d+)['"]?/i
  ];
  for (const regex of matchers) {
    const match = htmlOrScript.match(regex);
    if (match && match[1]) return match[1];
  }
  return null;
}

export function cleanCookies(cookieString: string): string {
  if (!cookieString) return "";
  const blacklistedKeys = [
    '_ga', '_gcl_au', '_gcl_aw', '_gcl_gs', '_gid',
    '_pin_unauth', '_derived_epik', '_ttp', '_tt_enable_cookie',
    'cto_bundle', '__rtbh.uid', '__rtbh.lid', '_uetsid', '_uetvid',
    'g_state'
  ];
  return cookieString
    .split(';')
    .map(c => c.trim())
    .filter(c => {
      const parts = c.split('=');
      const name = parts[0] ? parts[0].trim() : '';
      if (!name) return false;
      if (blacklistedKeys.includes(name)) return false;
      if (name.startsWith('_hj')) return false; // Hotjar
      if (name.startsWith('ttcsid')) return false; // TikTok
      return true;
    })
    .join('; ');
}

export async function renewAffiliateCookie(uid, db, currentCookie): Promise<string | null> {
  console.log(`[ML-UTILS] renewAffiliateCookie START - uid: ${uid}`);
  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9"
    };
    if (currentCookie) {
      headers["Cookie"] = cleanCookies(currentCookie);
    }
    const lbRes = await fetch("https://www.mercadolivre.com.br/afiliados/linkbuilder", { headers });
    console.log(`[ML-UTILS] renewAffiliateCookie GET linkbuilder STATUS: ${lbRes.status}, finalURL: ${lbRes.url}`);

    // Se o ML redirecionou para login, a sessão expirou de verdade
    const finalUrl = lbRes.url || "";
    const isLoginPage = finalUrl.includes("/login") || finalUrl.includes("/registration") || lbRes.status === 401 || lbRes.status === 403;
    if (isLoginPage) {
      console.warn(`[ML-UTILS] renewAffiliateCookie: Session truly expired (redirected to login). Cannot renew without user re-login.`);
      await db.doc('users/' + uid + '/integrations/mercadolivre').set({
         affiliateCookieStatus: 'EXPIRADO',
         lastAffiliateCookieSync: new Date().toISOString()
      }, { merge: true });
      return null; // null = sessão expirada, não renovável
    }

    const setCookies = lbRes.headers.getSetCookie ? lbRes.headers.getSetCookie() : [];
    const rawCookie = lbRes.headers.get("set-cookie");
    const arrCookies = setCookies.length > 0 ? setCookies : (rawCookie ? [rawCookie] : []);
    
    const cookieMap: Record<string, string> = {};
    if (currentCookie) {
      currentCookie.split(';').forEach(part => {
         const [k, ...v] = part.split('=');
         if (k) cookieMap[k.trim()] = v.join('=').trim();
      });
    }

    const oldCsrf = cookieMap['_csrf'];
    const oldMetadata = cookieMap['metadata_session_id'];

    arrCookies.forEach(c => {
       const part = c.split(';')[0];
       const [k, ...v] = part.split('=');
       if (k) cookieMap[k.trim()] = v.join('=').trim();
    });

    if (!cookieMap['_csrf'] && oldCsrf) cookieMap['_csrf'] = oldCsrf;
    if (!cookieMap['metadata_session_id'] && oldMetadata) cookieMap['metadata_session_id'] = oldMetadata;

    const newCookie = cleanCookies(Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; '));
    console.log(`[ML-UTILS] renewAffiliateCookie MERGED cookies. Keys:`, Object.keys(cookieMap).join(', '));
    
    await db.doc('users/' + uid + '/integrations/mercadolivre').set({
       affiliateCookie: newCookie,
       affiliateCookieStatus: 'CONECTADO',
       lastAffiliateCookieSync: new Date().toISOString()
    }, { merge: true });

    return newCookie;
  } catch(e) {
    console.error("[ML-UTILS] Error renewing ML cookies", e);
    await db.doc('users/' + uid + '/integrations/mercadolivre').set({
       affiliateCookieStatus: 'EXPIRADO'
    }, { merge: true });
    return cleanCookies(currentCookie);
  }
}


export async function createAffiliateLinkFromFirestore(url, uid, db) {
  console.log(`[ML-UTILS] createAffiliateLinkFromFirestore START - url: ${url}, uid: ${uid}`);
  let targetUrl = url;
  let finalUrl = url;

  if (url.includes('click1.mercadolivre.com.br') || url.includes('/count') || url.includes('mclics/clicks')) {
    try {
      const redirRes = await fetch(url);
      if (redirRes.status >= 300 && redirRes.status < 400 && redirRes.headers.get('location')) {
         finalUrl = redirRes.headers.get('location');
      } else if (redirRes.url && redirRes.url !== url) {
         finalUrl = redirRes.url;
      }
    } catch (err) {}
  }

  const isCatalog = finalUrl.toLowerCase().includes('/p/mlb');
  const match = finalUrl.match(/MLB[-_]?(\d+)/i);
  if (match) {
     if (isCatalog) {
       targetUrl = 'https://www.mercadolivre.com.br/p/MLB' + match[1];
     } else {
       targetUrl = 'https://www.mercadolivre.com.br/MLB-' + match[1];
     }
     try {
       const parsedUrl = new URL(finalUrl);
       const searchParams = new URLSearchParams();
       
       const varId = parsedUrl.searchParams.get('searchVariation') || parsedUrl.searchParams.get('variation');
       if (varId) {
         searchParams.set('searchVariation', varId);
       }
       
       const attrs = parsedUrl.searchParams.get('attributes');
       if (attrs) {
         searchParams.set('attributes', attrs);
       }
       
       const queryStr = searchParams.toString();
       if (queryStr) {
         targetUrl += '?' + queryStr;
       }
     } catch (e) {
       const matchVar = finalUrl.match(/[?&](searchVariation|variation)=(\d+)/);
       if (matchVar) {
         targetUrl += `?searchVariation=${matchVar[2]}`;
       }
     }
  } else {
     targetUrl = finalUrl;
  }

  let mlCookies = `ml_affiliates_onboarding_banner_visits=%7B%22count%22%3A3%2C%22lastOpened%22%3A1777687358920%7D; inferredZipcode=true; _tt_enable_cookie=1; _ttp=01KNYQVK27FVDDW06817K69NC3_.tt.2; _d2id=d3f312c6-adca-4150-93e9-64d2a59e1cac; _hjSessionUser_783944=eyJpZCI6ImQ4NDViYzllLTZlY2MtNTkyMC05NzFkLTc1NjZmOTkwYzkwOSIsImNyZWF0ZWQiOjE3NzU5MjY4ODkzNTksImV4aXN0aW5nIjp0cnVlfQ==; c_Z1gqYTG=1; _pin_unauth=dWlkPU5UUmtPVEpsTVRndFpURmtOQzAwTVRGaExUa3dNRGt0TlRnM09UVXlPRE16TW1Oag; c_Z2m51t4=1; g_state={"i_l":0,"i_ll":1776369520697,"i_b":"BFEPJ0DhaiJarPL415r1bHQLUngW1vQt4SKofUjcNCc","i_e":{"enable_itp_optimization":20},"i_et":1776369520696}; orguseridp=2645015609; ssid=ghy-041615-d9Jp2HLZG48HjZnbqcXbx24L8H0CJd-__-2645015609-__-1871063950119--RRR_0-RRR_0; ftid=LpCL9B2PzUP7iADxJOg3dLY3VnE8EjWD-1776369533274; orgnickp=GN20250825064332; cookiesPreferencesNotLogged=%7B%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Atrue%2C%22performance%22%3Atrue%2C%22traceability%22%3Atrue%7D%7D; QSI_SI_d4ikElJeWDP7fzo_intercept=true; tooltip=true; p_dsid=3b7c27bf-1212-4ce5-af98-dc499e5f7bb5-1776369602722; cp=23070310; cross_esc_web-flow=%7B%22d3f312c6-adca-4150-93e9-64d2a59e1cac%22%3A%7B%229797332364%22%3A%222uddw6zmKya1xBeJDC2L2H62nvFIOPHSfZwB0TMFPw%3D%3D%22%7D%7D; _gcl_au=1.1.5383528.1775926889.698124046.1776370515.1776371059; LAST_SEARCH=Vevshao%20A22; _csrf=k7fiD7aaifnfTCXl-O7Oi3ZJ; cookiesPreferencesLoggedFallback=%7B%22userId%22%3A2645015609%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Atrue%2C%22performance%22%3Atrue%2C%22traceability%22%3Atrue%7D%7D; c_wP4d7=1; ml_cart-quantity=0; _hjSessionUser_580848=eyJpZCI6IjUxNWEyNzg4LWZmNjMtNTU0MC1hZjM5LTc2ZmIzYWM4MDlhYSIsImNyZWF0ZWQiOjE3Nzc2NzM2OTgyNDQsImV4aXN0aW5nIjp0cnVlfQ==; p_edsid=7b1f23a6-f700-39ee-8cc6-41ade78cc4aa-1777673847193; x-meli-session-id=armor.08b6cd30d65fac6400c58e8f41c5bd838b7b0db76d7b5780ab490851ddcd9de1d5a2dd05677913fafaed621055921ba305229700f36ea8c2fad0899c7dac6226888e29ad45820c2bc719f4d1ec6526990bc73f6575a8c3c7b51cd58149cd6bcd.d0e04b8e3b0d11deca216f473cf130f5; _hjSessionUser_720738=eyJpZCI6IjBjNDg1ZGQ1LTk5MTctNTRjZC05ZTE5LTMzYTQ2YjFlNjA5MCIsImNyZWF0ZWQiOjE3NzYzNjk1MjA2ODQsImV4aXN0aW5nIjp0cnVlfQ==; _gcl_gs=2.1.k1$i1777674243$u124475286; _gcl_aw=GCL.1777674247.CjwKCAjwntHPBhAaEiwA_Xp6RuNsIexGUQ8piSl4aBf3KGM5E7q8nJebWKqX5o2-JUShY5x_62aDsxoCzawQAvD_BwE; ttcsid_CPKRQ8RC77U8LS0GABLG=1777674247221::l9aCrFqg8EXqVBGNCZ8h.1.1777674249908.1; _ga=GA1.3.1980825368.1777674492; c_yVnns=1; c_xe42xnaFXxBAzUzt0QGr5g=polycard-web-lib%2F2.47.0; sc-menu-hide-new-section_MY_DETAILS=MY_DETAILS; sc-menu-hide-new-section_CREDIT_MARKET=CREDIT_MARKET; sc-menu-hide-new-item_brand_registry=brand_registry; _hjHasCachedUserAttributes=true; sc-menu-hide-new-item_catalog_suggestions=catalog_suggestions; orguserid=dZt9TT9d09td4; _derived_epik=dj0yJnU9RncyY3kzaEU0NndEUkkwN1JJRHBMbWlmVGV1WDdJWXcmbj1uTVl0ekJmS0VYSTlxUFV1eUZ6VllBJm09NCZ0PUFBQUFBR242cm1jJnJtPTQmcnQ9QUFBQUFHbjZybWMmc3A9Mg; __rtbh.uid=%7B%22eventType%22%3A%22uid%22%2C%22id%22%3A%222645015609%22%2C%22expiryDate%22%3A%222027-05-06T23%3A40%3A20.464Z%22%7D; __rtbh.lid=%7B%22eventType%22%3A%22lid%22%2C%22id%22%3A%22U38izEhtqruSbnO5bop8%22%2C%22expiryDate%22%3A%222027-05-06T23%3A40%3A20.464Z%22%7D; ttcsid_C9SJ5SBC77UADFMAH8T0=1778110816182::PUJ8c5yysrbXxGACV-It.24.1778111524318.1; _uetsid=412d7790477711f1b0d03d36a716f01b; _uetvid=15ac4f2035c811f1986d6b7ad0b2e966; ttcsid=1778110816183::2-NB8o2sdbDnstF3iQP5.26.1778111524585.0::1.704928.708129::0.0.0.0::0.0.0; ttcsid_CFVSC2JC77U0ARCJTCJ0=1778110816190::OhBH0Mcy-A-v7sGBZbtZ.22.1778111524585.1; cto_bundle=vBfXS19ubm5uZUhaT0FSTUhvJTJCYnpyeiUyRlBhaEIydnVWalFMNnRaWjRuUkdyZ2lCNXhTTFVvOHYlMkZYMkZDYSUyRmRaTWRwOHdvR1QxYWw5SFVYU0tQU3BtbFpaTSUyQnFjazZxNVRLbVpSWjhIUGZlT2w1WGxKZ2VFWUdsaWR4NHN4YWFyUlElMkZkOXJLakdDRGp5a1BSTDE5S2ZCTmR0aUtDOUUlMkJIdnVVOU9oWTJpeXNlVXE5YyUzRA; _mldataSessionId=6bd9dd81-4e15-420b-b779-02d26da7d083; cookiesPreferencesLogged=%7B%22userId%22%3A2645015609%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Atrue%2C%22performance%22%3Atrue%2C%22traceability%22%3Atrue%7D%7D; nsa_rotok=eyJhbGciOiJSUzI1NiIsImtpZCI6IjMiLCJ0eXAiOiJKV1QifQ.eyJpZGVudGlmaWVyIjoiZDdmNjQ1OGItMTllOC00NDQ0LTk4ZTktNzhhZTE4ODFkMmQ0Iiwicm90YXRpb25faWQiOiI1NDFiZGU1Ni0xOTEyLTQzMzYtODM3Yy05YjQ0ODYwYTI1MTgiLCJwbGF0Zm9ybSI6Ik1MIiwicm90YXRpb25fZGF0ZSI6MTc3ODEyNzQ1MiwiZXhwIjoxNzgwNzE4ODUyLCJqdGkiOiIwZmIzYWJjZi1hZGU2LTQyNDAtYTFkMC05MTk2NmJkNDUyNDYiLCJpYXQiOjE3NzgxMjY4NTIsInN1YiI6ImQ3ZjY0NThiLTE5ZTgtNDQ0NC05OGU5LTc4YWUxODgxZDJkNCJ9.a0u5JcfI3tAwiVkNXPCbAT-W4lhK6d6siUwH0SgFArIF_utl7SjdoNpTrZPpjIr_o5zE2Qe6jOPsRE-_0OjwRK1p6UfA-xw3lqV6Tkn8xtUrf0HAoUUzWIWbDxgVwtw7fb4rzZ3Sa1q_tyF_TF3qekP1zN0ieCSo_T6wScjMZZT6Y23DZufRMJmncQuCoDrTWNXpim6g1nvyWUJ2a8BPaAMiz6CeKCwGMWYM4kzBHSQMUi42a785Aats62GVBIvKsCmc9pEWHjNxA64gfe1Q8tCh6krtzDrbwfzzD3SK1PKfO6fZVvG4djTHP9YdSprqlzLcdJPnvZrbWMMUmTJegA; hide-cookie-banner=0-COOKIE_PREFERENCES_ALREADY_SET`;
  let affiliateTag = null;
  let affiliateCreateEndpoint = null;

  if (uid && db) {
    try {
      const mlSnap = await db.doc(`users/${uid}/integrations/mercadolivre`).get();
      if (mlSnap.exists) {
        const mlData = mlSnap.data();
        if (mlData.affiliateCookie) mlCookies = mlData.affiliateCookie;
        if (mlData.affiliateTag) affiliateTag = mlData.affiliateTag;
        if (!affiliateTag && mlData.userTag) affiliateTag = mlData.userTag; 
        if (mlData.affiliateCreateEndpoint) affiliateCreateEndpoint = mlData.affiliateCreateEndpoint;
      }
    } catch(e) {}
  }



  // Função auxiliar para fazer uma tentativa em um endpoint específico
  const tryEndpoint = async (cookieString: string, endpoint: string) => {
    const cleanedCookie = cleanCookies(cookieString);
    const csrfMatch = cleanedCookie.match(/(?:^|;)\s*_csrf=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1].trim() : '';

    const isOriginEndpoint = endpoint.includes("origin-navigation");
    const isApiMeli = endpoint.includes("api.mercadolivre") || endpoint.includes("api.meli");
    
    const requestBody = isOriginEndpoint 
      ? { url: targetUrl, tag: affiliateTag }
      : { url: targetUrl, tag: affiliateTag };

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "Content-Type": "application/json",
      "Origin": "https://www.mercadolivre.com.br",
      "Referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
    };

    if (!isApiMeli) {
      headers["Cookie"] = cleanedCookie;
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken;
        headers["x-csrf"] = csrfToken;
      }
      headers["x-requested-with"] = "XMLHttpRequest";
      headers["sec-fetch-dest"] = "empty";
      headers["sec-fetch-mode"] = "cors";
      headers["sec-fetch-site"] = "same-origin";
    }

    console.log(`[ML-UTILS] tryEndpoint: POST ${endpoint}`);
    const res = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      headers,
      body: JSON.stringify(requestBody)
    });
    
    const isOpaque = (res as any).type === 'opaqueredirect' || res.status === 0;
    const text = isOpaque ? '' : await res.text();
    console.log(`[ML-UTILS] tryEndpoint ${endpoint} -> status=${res.status}, type=${(res as any).type}, body=${text.substring(0, 300)}`);
    return { res, text, isOpaque };
  };

  // Endpoints a tentar em ordem (do mais provável ao fallback)
  const endpointsToTry = affiliateCreateEndpoint
    ? [affiliateCreateEndpoint]
    : [
        // 1. API pública do Mercado Livre Afiliados (portal web)
        "https://www.mercadolivre.com.br/afiliados/api/v1/links",
        // 2. Endpoint alternativo do portal
        "https://www.mercadolivre.com.br/afiliados/links",
        // 3. Endpoint origin-navigation (Next.js interno) 
        "https://www.mercadolivre.com.br/origin-navigation/api/affiliate-program/affiliate/createLink",
      ];

  const attemptRequest = async (cookieString: string) => {
    for (const ep of endpointsToTry) {
      const result = await tryEndpoint(cookieString, ep);
      const { res, text, isOpaque } = result;
      
      // Se recebeu redirect/405 = não autenticado neste endpoint, tenta o próximo
      if (isOpaque || res.status === 0 || res.status === 405 || (res.status >= 300 && res.status < 400)) {
        console.warn(`[ML-UTILS] Endpoint ${ep} returned redirect/405, trying next...`);
        continue;
      }
      // Se recebeu resposta real (mesmo que erro 4xx/5xx), retorna ela
      return { res, text, isOpaque: false };
    }
    // Todos falharam com redirect
    return { res: { status: 0, ok: false } as any, text: '', isOpaque: true };
  };


  try {
    console.log(`[ML-UTILS] attemptRequest to createLink API...`);
    let { res: createRes, text: createText, isOpaque: isFirstOpaque } = await attemptRequest(mlCookies);
    console.log(`[ML-UTILS] First attemptRequest result: status=${createRes.status}, isOpaque=${isFirstOpaque}`);

    // Se todos os endpoints retornaram redirect/405 = sessão expirada ou bloqueio de IP
    if (isFirstOpaque || createRes.status === 0) {
      console.warn(`[ML-UTILS] All endpoints returned redirect/opaque. Trying cookie renewal...`);
      const renewed = await renewAffiliateCookie(uid, db, mlCookies);
      if (!renewed) {
        return { ok: false, fallback: targetUrl, finalUrl, error: `SESSION_EXPIRED - Sua sessão do Mercado Livre expirou. Acesse as Integrações e clique em "Reconectar".` };
      }
      mlCookies = renewed;
      const { res: res2, text: text2, isOpaque: isOpaque2 } = await attemptRequest(mlCookies);
      createRes = res2;
      createText = text2;
      if (isOpaque2 || createRes.status === 0) {
        return { ok: false, fallback: targetUrl, finalUrl, error: `SESSION_EXPIRED - Sua sessão do Mercado Livre expirou. Acesse as Integrações e clique em "Reconectar".` };
      }
    } else if (createRes.status >= 400) {
      console.log(`[ML-UTILS] Got ${createRes.status}, trying cookie renewal...`);
      const renewed2 = await renewAffiliateCookie(uid, db, mlCookies);
      if (renewed2) {
        mlCookies = renewed2;
        const { res: res3, text: text3, isOpaque: isOpaque3 } = await attemptRequest(mlCookies);
        if (!isOpaque3 && res3.status < 400) {
          createRes = res3;
          createText = text3;
        }
      }
    }

    let shortUrl: string | null = null;
    try {
      const json = JSON.parse(createText);
      if (json && json.short_url) {
        shortUrl = json.short_url;
      } else if (json && json.data && json.data.short_url) {
        shortUrl = json.data.short_url;
      } else if (json && json.link) {
        shortUrl = json.link;
      } else if (json && json.shortUrl) {
         shortUrl = json.shortUrl;
      } else if (json && json.url) {
         shortUrl = json.url; 
      }
    } catch(e) {}

    if (shortUrl) {
      return { ok: true, short_url: shortUrl };
    }
    return { ok: false, fallback: targetUrl, finalUrl, error: `NO_SHORT_URL - Code ${createRes.status}: ${createText.substring(0, 400)}` };
  } catch (error) {
    return { ok: false, fallback: targetUrl, finalUrl, error: error.message };
  }
}

export async function convertToAffiliateLink(url, uid) {
  try {
    const db = getAdminDb();
    const res = await createAffiliateLinkFromFirestore(url, uid, db);
    if (res.ok && res.short_url) {
      return res.short_url; // Success
    }
    return res.fallback || url;
  } catch(e) {
    return url; // NEVER throw
  }
}

export function normalizeOfferCategory(category?: string | null, title?: string | null, defaultCat?: string | null) {
  const normTitle = (title || '').toLowerCase();
  if (normTitle.includes('tênis') || normTitle.includes('sapato')) return 'Moda e Acessórios';
  if (normTitle.includes('celular') || normTitle.includes('iphone') || normTitle.includes('samsung') || normTitle.includes('smartphone')) return 'Smartphones';
  if (normTitle.includes('tv') || normTitle.includes('smart tv') || normTitle.includes('monitor')) return 'Eletrônicos';
  return defaultCat || category || 'Geral';
}

export async function collectAutomated(keyword: string, category?: string | null, uid?: string | null) {
  try {
     const token = await getMlAccessToken(uid);
     const headers: any = {
       "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
       "Accept": "application/json"
     };
     if (token) {
       headers["Authorization"] = `Bearer ${token}`;
     }
     const url = 'https://api.mercadolibre.com/sites/MLB/search?q=' + encodeURIComponent(keyword) + '&limit=20';
     const resp = await axios.get(url, { headers });
     const items = resp.data.results || [];
     return items.map((item: any) => {
        let price = Number(item.price);
        let originalPrice = item.original_price ? Number(item.original_price) : (item.base_price ? Number(item.base_price) : null);
        if (originalPrice && price > originalPrice) {
          [price, originalPrice] = [originalPrice, price];
        }
        if (originalPrice !== null && originalPrice <= price) {
          originalPrice = null;
        }
        let discountPercent = null;
        if (originalPrice && price && originalPrice > price) {
          discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
        }
        
        let isLightningDeal = false;
        if (Array.isArray(item.tags) && (item.tags.includes('lightning_deal') || item.tags.includes('deal_of_the_day'))) {
          isLightningDeal = true;
        }

        const fullTitle = (item.title || '').trim();
        const shortTitle = simplifyProductTitle(fullTitle);

        return {
          id: item.id,
          productId: item.id,
          title: shortTitle,
          titleShort: shortTitle,
          titleOriginal: fullTitle,
          price: price,
          originalPrice: originalPrice,
          discountPercent: discountPercent,
          hasDiscount: !!(originalPrice && originalPrice > price),
          isLightningDeal: isLightningDeal,
          imageUrl: item.thumbnail ? item.thumbnail.replace('-I.jpg', '-O.jpg') : null,
          productUrl: item.permalink,
          category: normalizeOfferCategory(category, item.title, 'Geral'),
          marketplace: 'mercadolivre',
          updatedAt: new Date().toISOString()
        };
     });
  } catch(e: any) {
     console.error("collectAutomated error:", e.message);
     return [];
  }
}

export async function saveOffers(offers: any[], uid: string | null = null) {
  if (!offers || !offers.length) return 0;
  
  const db = getAdminDb();

  // If uid not provided, try to find an active integration
  if (!uid) {
    try {
      const globalSnap = await db.doc("marketplace_integrations/mercadolivre").get();
      if (globalSnap.exists) {
        const mlData = globalSnap.data();
        if (mlData && mlData.connected && (mlData.affiliateCookie || mlData.cookie) && (mlData.affiliateTag || mlData.userTag)) {
          uid = mlData.uid || 'default_user';
        }
      }
    } catch (e) {}
  }

  if (!uid) {
    try {
      const usersSnap = await db.collection("users").get();
      for (const doc of usersSnap.docs) {
         const data = doc.data();
         if (data.mlAffiliateCookies && data.mlAffiliateTag) {
            uid = doc.id;
            break;
         }
         const mlSnap = await db.doc(`users/${doc.id}/integrations/mercadolivre`).get();
         if (mlSnap.exists) {
            const mlData = mlSnap.data();
            if ((mlData.affiliateCookie || mlData.cookie) && (mlData.affiliateTag || mlData.userTag)) {
               uid = doc.id;
               break;
            }
         }
      }
    } catch (e) {}
  }

  if (uid) {
    await Promise.all(offers.map(async (offer) => {
      if (offer.productUrl && offer.marketplace === 'mercadolivre') {
        try {
          const res = await createAffiliateLinkFromFirestore(offer.productUrl, uid, db);
          if (res.ok && res.short_url) {
            offer.affiliateUrl = res.short_url;
            offer.productUrl = res.short_url;
            offer.affiliateOwnerUid = uid;
          } else if (res.fallback) {
            // Se não conseguiu, mas tem um URL normalizado, atualiza apenas o produto
            offer.productUrl = res.fallback;
          }
        } catch (err) {
          // Ignora falha de conversão
        }
      }
    }));
  }

  let count = 0;
  const batch = db.batch();
  for (const offer of offers) {
     const ref = db.collection('offer_bank').doc((offer.id || offer.permalink || encodeURIComponent(offer.productUrl || 'null')).substring(0, 50));
     batch.set(ref, offer, { merge: true });
     count++;
     if (count === 490) break;
  }
  await batch.commit();
  return count;
}

async function resolveRedirect(url: string): Promise<string> {
  if (!url) return "";
  if (!url.startsWith("http")) return url;
  if (url.includes("produto.mercadolivre.com.br") || url.includes("www.mercadolivre.com.br/p/")) {
    return url;
  }
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.url || url;
  } catch (err) {
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      return res.url || url;
    } catch (e) {
      return url;
    }
  }
}

export async function scrapeProductPage(url, defaultCategory, uid?: string | null) {
  let resolvedUrl = url;
  try {
    resolvedUrl = await resolveRedirect(url);
  } catch (e) {}

  let finalUrl = resolvedUrl;
  if (resolvedUrl.includes('click1.mercadolivre.com.br') || resolvedUrl.includes('/count') || resolvedUrl.includes('mclics/clicks')) {
    try {
      const redirRes = await fetch(resolvedUrl);
      if (redirRes.status >= 300 && redirRes.status < 400 && redirRes.headers.get('location')) {
         finalUrl = redirRes.headers.get('location');
      } else if (redirRes.url && redirRes.url !== resolvedUrl) {
         finalUrl = redirRes.url;
      }
    } catch (err) {}
  }
  url = finalUrl;
  
  // Extract variation ID from URL
  let variationId: string | null = null;
  try {
    const parsedUrl = new URL(url);
    variationId = parsedUrl.searchParams.get('searchVariation') || parsedUrl.searchParams.get('variation');
  } catch (e) {
    const matchVar = url.match(/[?&](searchVariation|variation)=(\d+)/);
    if (matchVar) {
      variationId = matchVar[2];
    }
  }

  const match = url.match(/MLB[-]?\d+/i);
  if (!match) return null;
  const id = match[0].replace('-', '');

  // Method 1: Try REST API (with OAuth token if available)
  try {
    const token = await getMlAccessToken(uid);
    console.log(`[SCRAPER] Trying API method for ${id} (hasToken: ${!!token})...`);
    const headers: any = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await axios.get('https://api.mercadolibre.com/items/' + id, { headers });
    const item = res.data;
    if (item && item.price) {
      let price = Number(item.price);
      let originalPrice = item.original_price ? Number(item.original_price) : (item.base_price ? Number(item.base_price) : null);
      
      // Override with variation price if variationId is present and found
      if (variationId && Array.isArray(item.variations) && item.variations.length > 0) {
        const matchedVar = item.variations.find((v: any) => String(v.id) === variationId);
        if (matchedVar) {
          console.log(`[SCRAPER] Found matched variation ${variationId}. Price: ${matchedVar.price}`);
          if (matchedVar.price !== undefined && matchedVar.price !== null) {
            price = Number(matchedVar.price);
          }
          if (matchedVar.original_price !== undefined && matchedVar.original_price !== null) {
            originalPrice = Number(matchedVar.original_price);
          } else if (matchedVar.base_price !== undefined && matchedVar.base_price !== null) {
            originalPrice = Number(matchedVar.base_price);
          } else {
            originalPrice = null;
          }
        } else {
          console.warn(`[SCRAPER] Variation ID ${variationId} was specified but not found in item.variations`);
        }
      }

      if (originalPrice && price > originalPrice) {
        [price, originalPrice] = [originalPrice, price];
      }
      if (originalPrice !== null && originalPrice <= price) {
        originalPrice = null;
      }
      let discountPercent = null;
      if (originalPrice && price && originalPrice > price) {
        discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
      }

      let isLightningDeal = false;
      if (Array.isArray(item.tags) && (item.tags.includes('lightning_deal') || item.tags.includes('deal_of_the_day'))) {
        isLightningDeal = true;
      }

      // Complementary search call to fetch lightning deal tags from the search API
      try {
        const searchUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${item.id}`;
        const searchHeaders: any = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        };
        if (token) {
          searchHeaders["Authorization"] = `Bearer ${token}`;
        }
        const searchRes = await axios.get(searchUrl, { headers: searchHeaders, timeout: 4000 });
        const searchResults = searchRes.data?.results || [];
        const matchedItem = searchResults.find((r: any) => r.id === item.id);
        if (matchedItem) {
          if (Array.isArray(matchedItem.tags) && (matchedItem.tags.includes('lightning_deal') || matchedItem.tags.includes('deal_of_the_day'))) {
            isLightningDeal = true;
            console.log(`[SCRAPER] Detected lightning deal via complementary search API for ${item.id}`);
          }
        }
      } catch (searchErr: any) {
        console.warn(`[SCRAPER] Complementary search API failed or timed out for ${item.id}:`, searchErr.message);
      }

      const fullTitle = (item.title || '').trim();
      const shortTitle = simplifyProductTitle(fullTitle);

      return {
        id: item.id,
        productId: item.id,
        title: shortTitle,
        titleShort: shortTitle,
        titleOriginal: fullTitle,
        price: price,
        originalPrice: originalPrice,
        discountPercent: discountPercent,
        hasDiscount: !!(originalPrice && originalPrice > price),
        isLightningDeal: isLightningDeal,
        imageUrl: item.pictures && item.pictures.length > 0 ? item.pictures[0].url : item.thumbnail,
        productUrl: item.permalink,
        category: normalizeOfferCategory(defaultCategory, item.title, 'Geral'),
        marketplace: 'mercadolivre',
        updatedAt: new Date().toISOString()
      };
    }
  } catch (apiErr: any) {
    console.warn(`[SCRAPER] API method failed for ${id}:`, apiErr.message);
  }

  // Method 2: HTML Scraping with Cookie fallback
  try {
    console.log(`[SCRAPER] Trying HTML method for ${id}...`);
    const cookies = await getMlCookies(uid);
    const headers: any = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    };
    if (cookies) {
      headers["Cookie"] = cookies;
    }
    const res = await axios.get(url, { headers });
    const html = res.data;
    const $ = cheerio.load(html);

    let title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim();
    if (title === "Mercado Livre") {
      // Captcha or blocked page
      console.warn(`[SCRAPER] Cheerio scraping returned blocked page for ${id}`);
      return null;
    }

    const imageUrl = $('meta[property="og:image"]').attr('content');
    
    const getAmountFromEl = (el) => {
      let fraction = $(el).find('.andes-money-amount__fraction').first().text().replace(/\./g, '');
      let cents = $(el).find('.andes-money-amount__cents').first().text() || '00';
      if (!fraction) {
         const textPrice = $(el).text().replace(/[^\d,.-]/g, '');
         if (textPrice) {
            const parsed = parseFloat(textPrice.replace(',', '.'));
            if (!isNaN(parsed)) return parsed;
         }
         return null;
      }
      return parseFloat(`${fraction}.${cents}`);
    };

    let price = null;
    let originalPrice = null;
    
    // Selectors scoped to the main product price container to prevent picking up carousel/recommended items
    const priceContainer = $('.ui-pdp-price');
    if (priceContainer.length) {
      // 1. Try meta price inside price container
      const metaPrice = priceContainer.find('meta[itemprop="price"]').first().attr('content');
      if (metaPrice) {
        price = parseFloat(metaPrice);
      } else {
        // 2. Try the primary money amount in the second line (active promotion price)
        const pEl = priceContainer.find('.ui-pdp-price__second-line .andes-money-amount').first();
        if (pEl.length) {
          price = getAmountFromEl(pEl);
        } else {
          // 3. Fallback to any money amount in price container that isn't the previous price
          const pElAlt = priceContainer.find('.andes-money-amount:not(.andes-money-amount--previous):not(del *)').first();
          if (pElAlt.length) {
            price = getAmountFromEl(pElAlt);
          }
        }
      }

      // Try original price inside the main container
      const opEl1 = priceContainer.find('s.ui-pdp-price__original-value').first();
      const opEl2 = priceContainer.find('.ui-pdp-price__original-value').first();
      const opEl3 = priceContainer.find('s[aria-label^="Antes:"]').first();
      const opEl4 = priceContainer.find('.andes-money-amount--previous').first();

      if (opEl1.length) originalPrice = getAmountFromEl(opEl1);
      else if (opEl2.length) originalPrice = getAmountFromEl(opEl2);
      else if (opEl3.length) originalPrice = getAmountFromEl(opEl3);
      else if (opEl4.length) originalPrice = getAmountFromEl(opEl4);
    }

    // Global fallbacks if container scoping didn't yield values
    if (!price || isNaN(price)) {
      const priceMeta1 = $('meta[itemprop="price"]').attr('content');
      const priceMeta2 = $('span[itemprop="offers"] meta[itemprop="price"]').attr('content');
      if (priceMeta1) price = parseFloat(priceMeta1);
      else if (priceMeta2) price = parseFloat(priceMeta2);
      else {
         let pEl1 = $('.ui-pdp-price__second-line .andes-money-amount').first();
         if (pEl1.length) price = getAmountFromEl(pEl1);
         else {
            let pEl2 = $('.andes-money-amount:not(.andes-money-amount--previous):not(del *)').first();
            if (pEl2.length) price = getAmountFromEl(pEl2);
         }
      }
    }

    if (!originalPrice || isNaN(originalPrice)) {
      const opEl1 = $('s.ui-pdp-price__original-value').first();
      const opEl2 = $('.ui-pdp-price__original-value').first();
      const opEl3 = $('s[aria-label^="Antes:"]').first();
      
      if (opEl1.length) originalPrice = getAmountFromEl(opEl1);
      else if (opEl2.length) originalPrice = getAmountFromEl(opEl2);
      else if (opEl3.length) originalPrice = getAmountFromEl(opEl3);
    }

    if (originalPrice && price && originalPrice <= price) {
       originalPrice = null;
    }

    let discountPercent = null;
    if (price > 0 && originalPrice > price) {
        const discountText = $('.ui-pdp-price__discount, [class*="discount"]').first().text().trim();
        const discMatch = discountText.match(/(\d+)%\s*OFF/i);
        if (discMatch) {
           discountPercent = parseInt(discMatch[1]);
         } else {
           discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
         }
    }

    let isLightningDeal = false;
    const bodyText = $('body').text();
    const lightningContainer = $('.ui-pdp-promotions-pill, .ui-pdp-color--LIGHTNING_DEAL, [class*="lightning"]');
    if (lightningContainer.length && lightningContainer.text().toUpperCase().includes("OFERTA RELÂMPAGO")) {
      isLightningDeal = true;
    } else if (bodyText.toUpperCase().includes("OFERTA RELÂMPAGO")) {
      const topText = $('html').html()?.substring(0, 40000) || "";
      if (topText.toUpperCase().includes("OFERTA RELÂMPAGO")) {
        isLightningDeal = true;
      }
    }

    if (title && price > 0) {
      const fullTitle = title.trim();
      const shortTitle = simplifyProductTitle(fullTitle);
      
      // Fallback check for lightning deal in case HTML scraping succeeded but the banner wasn't identified
      if (!isLightningDeal) {
        try {
          const token = await getMlAccessToken(uid);
          const searchUrl = `https://api.mercadolibre.com/sites/MLB/search?q=${id}`;
          const searchHeaders: any = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json"
          };
          if (token) {
            searchHeaders["Authorization"] = `Bearer ${token}`;
          }
          const searchRes = await axios.get(searchUrl, { headers: searchHeaders, timeout: 3000 });
          const searchResults = searchRes.data?.results || [];
          const matchedItem = searchResults.find((r: any) => r.id === id);
          if (matchedItem && Array.isArray(matchedItem.tags)) {
            if (matchedItem.tags.includes('lightning_deal') || matchedItem.tags.includes('deal_of_the_day')) {
              isLightningDeal = true;
              console.log(`[SCRAPER] Detected lightning deal via HTML-fallback search API for ${id}`);
            }
          }
        } catch (searchErr) {}
      }
      return {
        id: id,
        productId: id,
        title: shortTitle,
        titleShort: shortTitle,
        titleOriginal: fullTitle,
        price: price,
        originalPrice: originalPrice,
        discountPercent: discountPercent,
        hasDiscount: !!(originalPrice && originalPrice > price),
        isLightningDeal: isLightningDeal,
        imageUrl: imageUrl || null,
        productUrl: url,
        category: normalizeOfferCategory(defaultCategory, title, 'Geral'),
        marketplace: 'mercadolivre',
        updatedAt: new Date().toISOString()
      };
    }
  } catch (htmlErr: any) {
    console.error(`[SCRAPER] HTML method failed for ${id}:`, htmlErr.message);
  }

  return null;
}
