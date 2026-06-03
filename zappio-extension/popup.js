document.addEventListener('DOMContentLoaded', async () => {
  const syncBtn = document.getElementById('sync-btn');
  const zappioUrlSelect = document.getElementById('zappio-url');
  const tagInput = document.getElementById('affiliate-tag');
  const aliTagInput = document.getElementById('aliexpress-tag');
  const statusBox = document.getElementById('status');

  // Load saved configuration from storage
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['zappioUrl', 'affiliateTag', 'aliexpressTag'], (result) => {
      if (result.zappioUrl) zappioUrlSelect.value = result.zappioUrl;
      if (result.affiliateTag) tagInput.value = result.affiliateTag;
      if (result.aliexpressTag) aliTagInput.value = result.aliexpressTag;
    });
  }

  // Save config on change
  const saveConfig = () => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        zappioUrl: zappioUrlSelect.value,
        affiliateTag: tagInput.value,
        aliexpressTag: aliTagInput.value
      });
    }
  };
  zappioUrlSelect.addEventListener('change', saveConfig);
  tagInput.addEventListener('input', saveConfig);
  aliTagInput.addEventListener('input', saveConfig);

  const showStatus = (text, type) => {
    statusBox.innerHTML = text.replace(/\n/g, '<br>');
    statusBox.className = `status-box status-${type}`;
    statusBox.style.display = 'block';
  };

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="spinner"></span> Sincronizando...';
    statusBox.style.display = 'none';

    const zappioUrl = zappioUrlSelect.value;
    const mlTag = tagInput.value.trim();
    const aliTag = aliTagInput.value.trim();

    let mlSuccess = false;
    let aliSuccess = false;
    let mlMessage = '';
    let aliMessage = '';
    let hasAttempt = false;

    // Helper to get cookies by domain
    const getCookies = (domain) => {
      return new Promise((resolve) => {
        chrome.cookies.getAll({ domain }, (cookies) => {
          resolve(cookies || []);
        });
      });
    };

    // --- 1. Mercado Livre Sync ---
    if (mlTag) {
      hasAttempt = true;
      try {
        const mlCookies = await getCookies('mercadolivre.com.br');
        if (mlCookies.length === 0) {
          mlMessage = '❌ Mercado Livre: Nenhum cookie ativo. Faça login no ML no navegador.';
        } else {
          const cookieString = mlCookies.map(c => `${c.name}=${c.value}`).join('; ');
          const endpoint = `${zappioUrl}/api/integrations/mercadolivre/cookie-config?uid=default_user`;
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookie: cookieString, affiliateTag: mlTag })
          });
          const result = await response.json();
          if (response.ok && result.ok) {
            mlSuccess = true;
            mlMessage = `✅ Mercado Livre: ${mlCookies.length} cookies sincronizados com sucesso.`;
          } else {
            mlMessage = `❌ Mercado Livre: Falha ao sincronizar (${result.error || 'Erro na API'}).`;
          }
        }
      } catch (err) {
        mlMessage = `❌ Mercado Livre: Erro de conexão (${err.message}).`;
      }
    }

    // --- 2. AliExpress Sync (xman_t) ---
    hasAttempt = true;
    try {
      // Fetch cookies from aliexpress.com
      const aliCookies = await getCookies('aliexpress.com');
      const xmanCookie = aliCookies.find(c => c.name === 'xman_t');

      if (aliCookies.length === 0 || !xmanCookie) {
        aliMessage = '❌ AliExpress: Cookie xman_t não encontrado. Faça login no AliExpress no navegador.';
      } else {
        // Compile all cookies (or specific string containing xman_t)
        const cookieString = aliCookies.map(c => `${c.name}=${c.value}`).join('; ');
        const endpoint = `${zappioUrl}/api/integrations/aliexpress/cookie-config?uid=default_user`;
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cookie: cookieString, affiliateTag: aliTag })
        });
        const result = await response.json();
        if (response.ok && result.ok) {
          aliSuccess = true;
          aliMessage = `✅ AliExpress: Cookie xman_t e sessão sincronizados com sucesso.`;
        } else {
          aliMessage = `❌ AliExpress: Falha ao sincronizar (${result.error || 'Erro na API'}).`;
        }
      }
    } catch (err) {
      aliMessage = `❌ AliExpress: Erro de conexão (${err.message}).`;
    }

    // --- 3. Output Status Summary ---
    const finalMessage = [mlMessage, aliMessage].filter(Boolean).join('\n');
    
    if ((mlSuccess || !mlTag) && aliSuccess) {
      showStatus(finalMessage, 'success');
    } else if (mlSuccess || aliSuccess) {
      // Partial success (one of them worked)
      showStatus(finalMessage + '\n\nAviso: Conexão parcial concluída.', 'success');
    } else {
      showStatus(finalMessage || 'Nenhuma conta configurada para sincronizar.', 'error');
    }

    syncBtn.disabled = false;
    syncBtn.textContent = 'Sincronizar Contas';
  });
});
