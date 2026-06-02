
export async function fetchWithTimeout(resource: string, options: any = {}, timeout = 30000) {
  const { signal, ...rest } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resource, {
      ...rest,
      signal: controller.signal
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('TIMEOUT: A requisição demorou demais e foi cancelada.');
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Secure fetch helper that validates JSON response and content-type.
 * Prevents "Unexpected token <" errors from HTML fallbacks.
 */
export async function fetchJson(url: string, options: any = {}) {
  console.log("FETCH_JSON_REQUEST", { url, method: options.method || 'GET' });
  
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!contentType.includes("application/json")) {
    console.error("API_RETURNED_NON_JSON", {
      url,
      status: response.status,
      contentType,
      bodyPreview: text.slice(0, 500)
    });

    throw new Error(
      `A rota ${url} não retornou JSON. Status ${response.status}. Verifique se a API existe na Vercel.`
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    console.error("INVALID_JSON_RESPONSE", {
      url,
      status: response.status,
      bodyPreview: text.slice(0, 500)
    });
    throw new Error(`Resposta inválida da API ${url}`);
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Erro HTTP ${response.status}`);
  }

  return data;
}
