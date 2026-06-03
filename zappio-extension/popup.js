document.addEventListener('DOMContentLoaded', async () => {
  const syncBtn = document.getElementById('sync-btn');
  const zappioUrlSelect = document.getElementById('zappio-url');
  const tagInput = document.getElementById('affiliate-tag');
  const statusBox = document.getElementById('status');

  // Load saved configuration from storage
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['zappioUrl', 'affiliateTag'], (result) => {
      if (result.zappioUrl) zappioUrlSelect.value = result.zappioUrl;
      if (result.affiliateTag) tagInput.value = result.affiliateTag;
    });
  }

  // Save config on change
  const saveConfig = () => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        zappioUrl: zappioUrlSelect.value,
        affiliateTag: tagInput.value
      });
    }
  };
  zappioUrlSelect.addEventListener('change', saveConfig);
  tagInput.addEventListener('input', saveConfig);

  const showStatus = (text, type) => {
    statusBox.textContent = text;
    statusBox.className = `status-box status-${type}`;
    statusBox.style.display = 'block';
  };

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="spinner"></span> Sincronizando...';
    statusBox.style.display = 'none';

    const zappioUrl = zappioUrlSelect.value;
    const tag = tagInput.value.trim();

    if (!tag) {
      showStatus('Por favor, insira sua Tag de Afiliado do Mercado Livre.', 'error');
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sincronizar Cookies';
      return;
    }

    try {
      // 1. Fetch all cookies from Mercado Livre Brazil domain
      console.log('Fetching cookies for mercadolivre.com.br...');
      chrome.cookies.getAll({ domain: 'mercadolivre.com.br' }, async (cookies) => {
        if (!cookies || cookies.length === 0) {
          showStatus('Nenhum cookie do Mercado Livre encontrado. Certifique-se de que você está logado no site do Mercado Livre no navegador.', 'error');
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sincronizar Cookies';
          return;
        }

        // 2. Format cookies to "name=value; name2=value2"
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log(`Successfully fetched ${cookies.length} cookies.`);

        // 3. Post cookies and tag to Zappio API
        const endpoint = `${zappioUrl}/api/integrations/mercadolivre/cookie-config?uid=default_user`;
        console.log('Sending cookies to endpoint:', endpoint);

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              cookie: cookieString,
              affiliateTag: tag
            })
          });

          const result = await response.json();
          if (response.ok && result.ok) {
            showStatus(`Sucesso! ${cookies.length} cookies sincronizados com sucesso. Seus links de afiliado agora estão ativos no Zappio.`, 'success');
          } else {
            showStatus(`Falha ao sincronizar: ${result.error || 'Erro desconhecido da API'}`, 'error');
          }
        } catch (postErr) {
          console.error('Failed to post cookies:', postErr);
          showStatus(`Erro ao conectar ao servidor Zappio: ${postErr.message}. Certifique-se de que o servidor está rodando ou que as permissões de CORS estão corretas.`, 'error');
        }

        syncBtn.disabled = false;
        syncBtn.textContent = 'Sincronizar Cookies';
      });
    } catch (err) {
      console.error('Extension cookie sync failed:', err);
      showStatus(`Falha ao ler cookies: ${err.message}`, 'error');
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sincronizar Cookies';
    }
  });
});
