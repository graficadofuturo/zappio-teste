import * as cheerio from 'cheerio';
import { getAdminDb } from './firebase-admin.js';
import axios from 'axios';
import { simplifyProductTitle } from '../../src/lib/productUtils.js';

async function getMlAccessToken(uid?: string | null): Promise<string | null> {
  const db = getAdminDb();
  if (uid) {
    const mlSnap = await db.doc(`users/${uid}/integrations/mercadolivre`).get();
    if (mlSnap.exists) {
      const mlData = mlSnap.data();
      if (mlData && mlData.connected && mlData.accessToken && !mlData.accessToken.startsWith('mock')) {
        return mlData.accessToken;
      }
    }
  }
  
  // Fallback: search for any connected integration with a real access token
  try {
    const usersSnap = await db.collection("users").get();
    for (const doc of usersSnap.docs) {
       const mlSnap = await db.doc(`users/${doc.id}/integrations/mercadolivre`).get();
       if (mlSnap.exists) {
          const mlData = mlSnap.data();
          if (mlData && mlData.connected && mlData.accessToken && !mlData.accessToken.startsWith('mock')) {
             return mlData.accessToken;
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

export async function renewAffiliateCookie(uid, db, currentCookie) {
  console.log(`[ML-UTILS] renewAffiliateCookie START - uid: ${uid}`);
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml"
    };
    if (currentCookie) {
      headers["Cookie"] = currentCookie;
    }
    const lbRes = await fetch("https://www.mercadolivre.com.br/afiliados/linkbuilder", { headers });
    console.log(`[ML-UTILS] renewAffiliateCookie GET linkbuilder STATUS: ${lbRes.status}`);

    const setCookies = lbRes.headers.getSetCookie ? lbRes.headers.getSetCookie() : [];
    const rawCookie = lbRes.headers.get("set-cookie");
    const arrCookies = setCookies.length > 0 ? setCookies : (rawCookie ? [rawCookie] : []);
    
    const cookieMap = {};
    if (currentCookie) {
      currentCookie.split(';').forEach(part => {
         const [k, ...v] = part.split('=');
         if (k) {
           cookieMap[k.trim()] = v.join('=').trim();
         }
      });
    }

    const oldCsrf = cookieMap['_csrf'];
    const oldMetadata = cookieMap['metadata_session_id'];

    arrCookies.forEach(c => {
       const part = c.split(';')[0];
       const [k, ...v] = part.split('=');
       if (k) {
         cookieMap[k.trim()] = v.join('=').trim();
       }
    });

    if (!cookieMap['_csrf'] && oldCsrf) cookieMap['_csrf'] = oldCsrf;
    if (!cookieMap['metadata_session_id'] && oldMetadata) cookieMap['metadata_session_id'] = oldMetadata;

    const newCookie = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
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
    return currentCookie;
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

  const match = finalUrl.match(/MLB[-_]?(\d+)/i);
  if (match) {
     targetUrl = 'https://www.mercadolivre.com.br/MLB-' + match[1];
  } else {
     targetUrl = finalUrl;
  }

  let mlCookies = `ml_affiliates_onboarding_banner_visits=%7B%22count%22%3A3%2C%22lastOpened%22%3A1777687358920%7D; inferredZipcode=true; _tt_enable_cookie=1; _ttp=01KNYQVK27FVDDW06817K69NC3_.tt.2; _d2id=d3f312c6-adca-4150-93e9-64d2a59e1cac; _hjSessionUser_783944=eyJpZCI6ImQ4NDViYzllLTZlY2MtNTkyMC05NzFkLTc1NjZmOTkwYzkwOSIsImNyZWF0ZWQiOjE3NzU5MjY4ODkzNTksImV4aXN0aW5nIjp0cnVlfQ==; c_Z1gqYTG=1; _pin_unauth=dWlkPU5UUmtPVEpsTVRndFpURmtOQzAwTVRGaExUa3dNRGt0TlRnM09UVXlPRE16TW1Oag; c_Z2m51t4=1; g_state={"i_l":0,"i_ll":1776369520697,"i_b":"BFEPJ0DhaiJarPL415r1bHQLUngW1vQt4SKofUjcNCc","i_e":{"enable_itp_optimization":20},"i_et":1776369520696}; orguseridp=2645015609; ssid=ghy-041615-d9Jp2HLZG48HjZnbqcXbx24L8H0CJd-__-2645015609-__-1871063950119--RRR_0-RRR_0; ftid=LpCL9B2PzUP7iADxJOg3dLY3VnE8EjWD-1776369533274; orgnickp=GN20250825064332; cookiesPreferencesNotLogged=%7B%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Atrue%2C%22performance%22%3Atrue%2C%22traceability%22%3Atrue%7D%7D; QSI_SI_d4ikElJeWDP7fzo_intercept=true; tooltip=true; p_dsid=3b7c27bf-1212-4ce5-af98-dc499e5f7bb5-1776369602722; cp=23070310; cross_esc_web-flow=%7B%22d3f312c6-adca-4150-93e9-64d2a59e1cac%22%3A%7B%229797332364%22%3A%222uddw6zmKya1xBeJDC2L2H62nvFIOPHSfZwB0TMFPw%3D%3D%22%7D%7D; _gcl_au=1.1.5383528.1775926889.698124046.1776370515.1776371059; LAST_SEARCH=Vevshao%20A22; _csrf=k7fiD7aaifnfTCXl-O7Oi3ZJ; cookiesPreferencesLoggedFallback=%7B%22userId%22%3A2645015609%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Atrue%2C%22performance%22%3Atrue%2C%22traceability%22%3Atrue%7D%7D; c_wP4d7=1; ml_cart-quantity=0; _hjSessionUser_580848=eyJpZCI6IjUxNWEyNzg4LWZmNjMtNTU0MC1hZjM5LTc2ZmIzYWM4MDlhYSIsImNyZWF0ZWQiOjE3Nzc2NzM2OTgyNDQsImV4aXN0aW5nIjp0cnVlfQ==; p_edsid=7b1f23a6-f700-39ee-8cc6-41ade78cc4aa-1777673847193; x-meli-session-id=armor.08b6cd30d65fac6400c58e8f41c5bd838b7b0db76d7b5780ab490851ddcd9de1d5a2dd05677913fafaed621055921ba305229700f36ea8c2fad0899c7dac6226888e29ad45820c2bc719f4d1ec6526990bc73f6575a8c3c7b51cd58149cd6bcd.d0e04b8e3b0d11deca216f473cf130f5; _hjSessionUser_720738=eyJpZCI6IjBjNDg1ZGQ1LTk5MTctNTRjZC05ZTE5LTMzYTQ2YjFlNjA5MCIsImNyZWF0ZWQiOjE3NzYzNjk1MjA2ODQsImV4aXN0aW5nIjp0cnVlfQ==; _gcl_gs=2.1.k1$i1777674243$u124475286; _gcl_aw=GCL.1777674247.CjwKCAjwntHPBhAaEiwA_Xp6RuNsIexGUQ8piSl4aBf3KGM5E7q8nJebWKqX5o2-JUShY5x_62aDsxoCzawQAvD_BwE; ttcsid_CPKRQ8RC77U8LS0GABLG=1777674247221::l9aCrFqg8EXqVBGNCZ8h.1.1777674249908.1; _ga=GA1.3.1980825368.1777674492; c_yVnns=1; c_xe42xnaFXxBAzUzt0QGr5g=polycard-web-lib%2F2.47.0; sc-menu-hide-new-section_MY_DETAILS=MY_DETAILS; sc-menu-hide-new-section_CREDIT_MARKET=CREDIT_MARKET; sc-menu-hide-new-item_brand_registry=brand_registry; _hjHasCachedUserAttributes=true; sc-menu-hide-new-item_catalog_suggestions=catalog_suggestions; orguserid=dZt9TT9d09td4; _derived_epik=dj0yJnU9RncyY3kzaEU0NndEUkkwN1JJRHBMbWlmVGV1WDdJWXcmbj1uTVl0ekJmS0VYSTlxUFV1eUZ6VllBJm09NCZ0PUFBQUFBR242cm1jJnJtPTQmcnQ9QUFBQUFHbjZybWMmc3A9Mg; __rtbh.uid=%7B%22eventType%22%3A%22uid%22%2C%22id%22%3A%222645015609%22%2C%22expiryDate%22%3A%222027-05-06T23%3A40%3A20.464Z%22%7D; __rtbh.lid=%7B%22eventType%22%3A%22lid%22%2C%22id%22%3A%22U38izEhtqruSbnO5bop8%22%2C%22expiryDate%22%3A%222027-05-06T23%3A40%3A20.464Z%22%7D; ttcsid_C9SJ5SBC77UADFMAH8T0=1778110816182::PUJ8c5yysrbXxGACV-It.24.1778111524318.1; _uetsid=412d7790477711f1b0d03d36a716f01b; _uetvid=15ac4f2035c811f1986d6b7ad0b2e966; ttcsid=1778110816183::2-NB8o2sdbDnstF3iQP5.26.1778111524585.0::1.704928.708129::0.0.0.0::0.0.0; ttcsid_CFVSC2JC77U0ARCJTCJ0=1778110816190::OhBH0Mcy-A-v7sGBZbtZ.22.1778111524585.1; cto_bundle=vBfXS19ubm5uZUhaT0FSTUhvJTJCYnpyeiUyRlBhaEIydnVWalFMNnRaWjRuUkdyZ2lCNXhTTFVvOHYlMkZYMkZDYSUyRmRaTWRwOHdvR1QxYWw5SFVYU0tQU3BtbFpaTSUyQnFjazZxNVRLbVpSWjhIUGZlT2w1WGxKZ2VFWUdsaWR4NHN4YWFyUlElMkZkOXJLakdDRGp5a1BSTDE5S2ZCTmR0aUtDOUUlMkJIdnVVOU9oWTJpeXNlVXE5YyUzRA; _mldataSessionId=6bd9dd81-4e15-420b-b779-02d26da7d083; cookiesPreferencesLogged=%7B%22userId%22%3A2645015609%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Atrue%2C%22performance%22%3Atrue%2C%22traceability%22%3Atrue%7D%7D; nsa_rotok=eyJhbGciOiJSUzI1NiIsImtpZCI6IjMiLCJ0eXAiOiJKV1QifQ.eyJpZGVudGlmaWVyIjoiZDdmNjQ1OGItMTllOC00NDQ0LTk4ZTktNzhhZTE4ODFkMmQ0Iiwicm90YXRpb25faWQiOiI1NDFiZGU1Ni0xOTEyLTQzMzYtODM3Yy05YjQ0ODYwYTI1MTgiLCJwbGF0Zm9ybSI6Ik1MIiwicm90YXRpb25fZGF0ZSI6MTc3ODEyNzQ1MiwiZXhwIjoxNzgwNzE4ODUyLCJqdGkiOiIwZmIzYWJjZi1hZGU2LTQyNDAtYTFkMC05MTk2NmJkNDUyNDYiLCJpYXQiOjE3NzgxMjY4NTIsInN1YiI6ImQ3ZjY0NThiLTE5ZTgtNDQ0NC05OGU5LTc4YWUxODgxZDJkNCJ9.a0u5JcfI3tAwiVkNXPCbAT-W4lhK6d6siUwH0SgFArIF_utl7SjdoNpTrZPpjIr_o5zE2Qe6jOPsRE-_0OjwRK1p6UfA-xw3lqV6Tkn8xtUrf0HAoUUzWIWbDxgVwtw7fb4rzZ3Sa1q_tyF_TF3qekP1zN0ieCSo_T6wScjMZZT6Y23DZufRMJmncQuCoDrTWNXpim6g1nvyWUJ2a8BPaAMiz6CeKCwGMWYM4kzBHSQMUi42a785Aats62GVBIvKsCmc9pEWHjNxA64gfe1Q8tCh6krtzDrbwfzzD3SK1PKfO6fZVvG4djTHP9YdSprqlzLcdJPnvZrbWMMUmTJegA; hide-cookie-banner=0-COOKIE_PREFERENCES_ALREADY_SET`;
  let affiliateTag = null;

  if (uid && db) {
    try {
      const mlSnap = await db.doc(`users/${uid}/integrations/mercadolivre`).get();
      if (mlSnap.exists) {
        const mlData = mlSnap.data();
        if (mlData.affiliateCookie) mlCookies = mlData.affiliateCookie;
        if (mlData.affiliateTag) affiliateTag = mlData.affiliateTag;
        if (!affiliateTag && mlData.userTag) affiliateTag = mlData.userTag; 
      }
    } catch(e) {}
  }

  // Sempre faz o fluxo de renovação ANTES do POST
  if (uid && db) {
    console.log(`[ML-UTILS] Renovando cookies ANTES do POST para o uid: ${uid}...`);
    mlCookies = await renewAffiliateCookie(uid, db, mlCookies);
  } else {
    console.log(`[ML-UTILS] Aviso: uid ou db não fornecidos, pulando renovação de cookies.`);
  }

  const attemptRequest = async (cookieString) => {
    const csrfMatch = cookieString.match(/(?:^|;)\s*_csrf=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1] : 'sNEauQE4--r3JZa8_x1blVKCw8Srjb7syJ9U';

    return fetch("https://www.mercadolivre.com.br/origin-navigation/api/affiliate-program/affiliate/createLink", {
       method: "POST",
       headers: {
         "Cookie": cookieString,
         "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
         "Accept": "application/json",
         "Content-Type": "application/json",
         "Origin": "https://www.mercadolivre.com.br",
         "Referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
         "x-csrf-token": csrfToken,
         "x-requested-with": "XMLHttpRequest"
       },
       body: JSON.stringify({
         url: targetUrl,
         tag: affiliateTag
       })
    });
  };

  try {
    console.log(`[ML-UTILS] attemptRequest to createLink API...`);
    let createRes = await attemptRequest(mlCookies);
    let createText = await createRes.text();
    console.log(`[ML-UTILS] POST createLink STATUS: ${createRes.status}`);
    console.log(`[ML-UTILS] POST createLink BODY:`, createText);
    
    // Fallback caso falhe mesmo com a renovação prévia
    if (createRes.status >= 400 && createRes.status !== 405) {
      console.log(`[ML-UTILS] ML link creation failed with ${createRes.status}, trying second renew cookie...`);
      mlCookies = await renewAffiliateCookie(uid, db, mlCookies);
      createRes = await attemptRequest(mlCookies);
      createText = await createRes.text();
      console.log(`[ML-UTILS] Second POST createLink STATUS: ${createRes.status}`);
      console.log(`[ML-UTILS] Second POST createLink BODY:`, createText);
    }

    let shortUrl = null;
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
    return { ok: false, fallback: targetUrl, finalUrl, error: `NO_SHORT_URL - Code ${createRes.status}` };
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
        let originalPrice = item.original_price ? Number(item.original_price) : null;
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
  const match = url.match(/MLB[-]?\d+/i);
  if (!match) return null;
  const id = match[0].replace('-', '');
  try {
    const token = await getMlAccessToken(uid);
    const headers: any = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await axios.get('https://api.mercadolibre.com/items/' + id, { headers });
    const item = res.data;
    
    let price = Number(item.price);
    let originalPrice = item.original_price ? Number(item.original_price) : null;
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
      imageUrl: item.pictures && item.pictures.length > 0 ? item.pictures[0].url : item.thumbnail,
      productUrl: item.permalink,
      category: normalizeOfferCategory(defaultCategory, item.title, 'Geral'),
      marketplace: 'mercadolivre',
      updatedAt: new Date().toISOString()
    };
  } catch(e: any) {
    console.error("scrapeProductPage error:", e.message);
    return null;
  }
}
