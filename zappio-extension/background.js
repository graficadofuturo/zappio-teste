// background.js — Zappio Extension Background Service Worker
// Responsável por criar links de afiliado do ML DIRETAMENTE do browser,
// usando as cookies da sessão nativa do ML (sem passar pelo servidor Vercel)

const ML_ENDPOINTS = [
  "https://www.mercadolivre.com.br/origin-navigation/api/affiliate-program/affiliate/createLink",
  "https://www.mercadolivre.com.br/afiliados/api/links",
  "https://www.mercadolivre.com.br/afiliados/api/link",
];

// Cria link de afiliado ML usando cookies do browser (bypass do servidor)
async function createMLAffiliateLinkBrowser(productUrl, affiliateTag) {
  // 1. Pega todos os cookies do ML do browser
  const allCookies = await chrome.cookies.getAll({ domain: "mercadolivre.com.br" });
  if (!allCookies || allCookies.length === 0) {
    return { ok: false, error: "Nenhum cookie do ML encontrado. Faça login no Mercado Livre." };
  }

  // 2. Extrai o CSRF token dos cookies
  const csrfCookie = allCookies.find(c => c.name === "_csrf");
  const csrfToken = csrfCookie ? csrfCookie.value : "";

  // 3. Tenta cada endpoint em cascata
  for (const endpoint of ML_ENDPOINTS) {
    try {
      console.log(`[ZAPPIO-BG] Trying ML endpoint: ${endpoint}`);
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include", // usa cookies do browser automaticamente
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "pt-BR,pt;q=0.9",
          "Origin": "https://www.mercadolivre.com.br",
          "Referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
          "x-csrf-token": csrfToken,
          "x-csrf": csrfToken,
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify({ url: productUrl, tag: affiliateTag }),
      });

      console.log(`[ZAPPIO-BG] Endpoint ${endpoint} -> status: ${res.status}`);

      // Pula redirects e 405 (S3), tenta próximo
      if (res.status === 0 || res.status === 405 || (res.status >= 300 && res.status < 400)) {
        continue;
      }

      const text = await res.text();

      // Pula 404 HTML (página SPA do portal, não API real)
      if (res.status === 404 && text.includes("<!DOCTYPE html")) {
        continue;
      }

      // Tenta parsear JSON e extrair short_url
      try {
        const json = JSON.parse(text);
        const shortUrl =
          json.short_url ||
          (json.data && json.data.short_url) ||
          json.link ||
          json.shortUrl ||
          json.url ||
          null;

        if (shortUrl) {
          console.log(`[ZAPPIO-BG] ✅ Short URL created: ${shortUrl}`);
          return { ok: true, short_url: shortUrl };
        }
        // API respondeu mas sem short_url
        console.warn(`[ZAPPIO-BG] API responded (${res.status}) but no short_url. Body:`, text.substring(0, 300));
        return { ok: false, error: `API respondeu sem short_url (${res.status}): ${text.substring(0, 200)}` };
      } catch (parseErr) {
        console.warn(`[ZAPPIO-BG] Non-JSON response from ${endpoint}:`, text.substring(0, 300));
        return { ok: false, error: `Resposta inválida (${res.status}): ${text.substring(0, 200)}` };
      }
    } catch (err) {
      console.error(`[ZAPPIO-BG] Network error on ${endpoint}:`, err.message);
    }
  }

  return { ok: false, error: "Todos os endpoints do ML falharam. Verifique se está logado no Mercado Livre Afiliados." };
}

// Escuta mensagens do popup ou content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CREATE_ML_AFFILIATE_LINK") {
    const { productUrl, affiliateTag } = message;
    createMLAffiliateLinkBrowser(productUrl, affiliateTag)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }
});
