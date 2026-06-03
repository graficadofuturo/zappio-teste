import { useState, useEffect } from 'react';
import { auth, db, GLOBAL_USER_ID } from '../lib/firebase.js';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils.js';
import { ShoppingBag, Loader2, Sparkles, AlertCircle, Trash2, RefreshCw, ExternalLink, CheckCircle2, Settings, Zap, Link2, Package } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchJson } from '../utils/apiUtils.js';

export default function Integrations() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [mercadoLivreConnected, setMercadoLivreConnected] = useState(false);
  const [mercadoLivreLoading, setMercadoLivreLoading] = useState(true);

  const [syncing, setSyncing] = useState<string | null>(null);
  const [checkingApiStatus, setCheckingApiStatus] = useState(false);
  const [syncingMl, setSyncingMl] = useState(false);
  const [disconnectingMl, setDisconnectingMl] = useState(false);
  const [mlApiStatus, setMlApiStatus] = useState<any>(null);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  const [shopeeAppId, setShopeeAppId] = useState('');
  const [shopeeAppSecret, setShopeeAppSecret] = useState('');
  const [isShopeeFormOpen, setIsShopeeFormOpen] = useState(false);
  const [savingShopee, setSavingShopee] = useState(false);

  const [mlCookieConfig, setMlCookieConfig] = useState<any>(null);
  const [cookieInput, setCookieInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [testUrl, setTestUrl] = useState('');
  const [testingUrl, setTestingUrl] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const showSuccess = (text: string) => {
    setMessage({ type: 'success', text });
    setTimeout(() => setMessage(null), 5000);
  };

  const showError = (text: string) => {
    setMessage({ type: 'error', text });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchMlCookieConfig = async () => {
    try {
      const res = await fetch(`/api/integrations/mercadolivre/cookie-config?uid=${GLOBAL_USER_ID}`).then(r => r.json());
      if (res.ok && res.config) {
        setMlCookieConfig(res.config);
        if (res.config.affiliateTag) {
          setTagInput(res.config.affiliateTag);
        }
      }
    } catch (err) {
      console.error('ML_COOKIE_CONFIG_ERR', err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/integrations/mercadolivre/cookie-config?uid=${GLOBAL_USER_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookie: cookieInput,
          affiliateTag: tagInput
        })
      }).then(r => r.json());
      
      if (res.ok) {
        showSuccess('Configuração de Afiliado salva com sucesso.');
        setCookieInput('');
        await fetchMlCookieConfig();
      } else {
        showError('Erro ao salvar configuração.');
      }
    } catch (err: any) {
      showError(err.message || 'Erro ao salvar.');
    }
    setSavingConfig(false);
  };

  const handleTestConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl) return;
    setTestingUrl(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/mercadolivre/convert-affiliate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: testUrl,
          uid: GLOBAL_USER_ID
        })
      }).then(r => r.json());
      
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    }
    setTestingUrl(false);
  };

  useEffect(() => {
    loadIntegrations();

    const params = new URLSearchParams(window.location.search);
    const mlParam = params.get('mercadolivre');

    console.log('ML_URL_PARAM', mlParam);

    if (mlParam) {
      window.history.replaceState({}, '', '/integrations');
    }

    if (mlParam && mlParam !== 'connected') {
      const mlErrors: Record<string, string> = {
        'missing_code': 'O Mercado Livre não retornou o código de autorização.',
        'invalid_state': 'Sessão de conexão expirada. Tente conectar novamente.',
        'token_error': 'Erro ao trocar autorização por token.',
        'config_error': 'As configurações do Mercado Livre estão incompletas.',
        'firestore_not_found': 'Firestore não encontrado.',
        'missing_user': 'Usuário não identificado.',
        'error': 'Não foi possível conectar ao Mercado Livre.'
      };
      showError(mlErrors[mlParam] || `Erro Mercado Livre: ${mlParam}`);
    }

    async function checkStatus() {
      try {
        setMercadoLivreLoading(true);
        setCheckingApiStatus(true);

        try {
          const data = await fetchJson(`/api/mercadolivre?action=status&uid=${GLOBAL_USER_ID}`);
          console.log('ML_STATUS_RESULT', data);

          setMlApiStatus(data);
          const isReallyConnected = data.connected === true || data.status === 'active' || data.status === 'connected';
          setMercadoLivreConnected(isReallyConnected);

          await fetchMlCookieConfig();

          if (mlParam === 'connected') {
            if (isReallyConnected) showSuccess('Mercado Livre conectado com sucesso.');
            else showError('Conexão autorizada, mas a integração não foi encontrada.');
          }
        } catch (err: any) {
          console.error('ML_STATUS_FETCH_ERR', err);
          showError(err.message);
        }
        
        setMercadoLivreLoading(false);
        setCheckingApiStatus(false);
      } catch (error) {
        console.error('ML_STATUS_ERROR', error);
        setMercadoLivreConnected(false);
        setMercadoLivreLoading(false);
        setCheckingApiStatus(false);
      }
    }

    checkStatus();
  }, [searchParams, navigate]);

  const handleConnectML = async () => {
    try {
      setSyncing('ml');
      setMessage(null);

      const data = await fetchJson(`/api/integrations/mercadolivre/auth-url?uid=${GLOBAL_USER_ID}`);
      console.log('ML_AUTH_URL_RESPONSE', data);

      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else {
        throw new Error('URL de autorização não recebida.');
      }
    } catch (e: any) {
      console.error('CONNECT_ML_ERROR', e);
      showError(e.message);
    } finally {
      setSyncing(null);
    }
  };

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'ecommerce_keys'), where('user_id', '==', GLOBAL_USER_ID));
      const querySnapshot = await getDocs(q);
      setIntegrations(querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'ecommerce_keys');
    }
    setLoading(false);
  };

  const checkMlApiStatus = async () => {
    setCheckingApiStatus(true);
    setMercadoLivreLoading(true);
    try {
      const data = await fetchJson(`/api/mercadolivre?action=status&uid=${GLOBAL_USER_ID}`);
      setMlApiStatus(data);
      const isConnected = data.connected === true || data.status === 'active' || data.status === 'connected';
      setMercadoLivreConnected(isConnected);

      await fetchMlCookieConfig();
    } catch (e: any) {
      console.error('Error checking ML status:', e);
      showError(e.message);
      setMercadoLivreConnected(false);
    } finally {
      setCheckingApiStatus(false);
      setMercadoLivreLoading(false);
    }
  };

  const saveShopee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingShopee(true);
    try {
      const payload: any = {
        user_id: GLOBAL_USER_ID,
        platform: 'shopee',
        api_key: shopeeAppId,
        api_secret: shopeeAppSecret,
        status: 'connected',
        sync_count: 0,
        updated_at: new Date()
      };

      await addDoc(collection(db, 'ecommerce_keys'), payload);
      setShopeeAppId('');
      setShopeeAppSecret('');
      setIsShopeeFormOpen(false);
      await loadIntegrations();

      showSuccess('Shopee conectada com sucesso!');
    } catch (e) {
      showError('Erro ao salvar Shopee.');
    }
    setSavingShopee(false);
  };

  const handleDisconnectMl = async () => {
    try {
      setDisconnectingMl(true);
      setShowDisconnectModal(false);

      const data = await fetchJson(`/api/integrations/mercadolivre/disconnect?uid=${GLOBAL_USER_ID}`, {
        method: 'POST'
      });

      setMercadoLivreConnected(false);
      showSuccess('Mercado Livre desconectado com sucesso.');
      await checkMlApiStatus();
    } catch (error: any) {
      console.error('ML_DISCONNECT_ERROR', error);
      showError(error.message);
    } finally {
      setDisconnectingMl(false);
    }
  };

  const handleSyncMl = async () => {
    try {
      setSyncingMl(true);

      const data = await fetchJson('/api/mercadolivre?action=sync-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: GLOBAL_USER_ID })
      });

      showSuccess(`Sincronização concluída! ${data.syncCount || 0} produtos processados.`);
      await checkMlApiStatus();
    } catch (error: any) {
      console.error('ML_SYNC_ERROR', error);
      showError(error.message);
    } finally {
      setSyncingMl(false);
    }
  };

  const handleDisconnect = async (id: string, platform?: string) => {
    if (platform === 'mercadolivre') {
      setShowDisconnectModal(true);
      return;
    }

    try {
      await deleteDoc(doc(db, 'ecommerce_keys', id));
      await loadIntegrations();
      showSuccess('Integração desconectada com sucesso.');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'ecommerce_keys');
    }
  };

  const mlIntegration = integrations.find(i => i.platform === 'mercadolivre' || i.platform === 'mercado_livre');
  const shopeeIntegration = integrations.find(i => i.platform === 'shopee');

  return (
    <div className="page-content">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Integrações</h1>
          <p className="page-subtitle">Conecte seus marketplaces para importar produtos e links de afiliado automaticamente.</p>
        </div>
      </div>

      {/* Toast notification */}
      {message && (
        <div className={`toast ${message.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          </span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>

        {/* ── Mercado Livre Card ── */}
        <div className="integration-card integration-card-ml">
          {/* Card Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#ca8a04', flexShrink: 0
              }}>
                <ShoppingBag size={22} />
              </div>
              <div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Mercado Livre
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, margin: '3px 0 0' }}>OAuth 2.0 · Afiliados</p>
              </div>
            </div>

            {/* Status Badge */}
            {mercadoLivreLoading ? (
              <div className="badge badge-gray" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Verificando
              </div>
            ) : mercadoLivreConnected ? (
              <div className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <span className="pulse-dot" style={{ width: 6, height: 6, flexShrink: 0 }} /> Conectado
              </div>
            ) : (
              <div className="badge badge-gray" style={{ flexShrink: 0 }}>Desconectado</div>
            )}
          </div>

          {/* Account Info Panel (only when connected + data available) */}
          {!mercadoLivreLoading && mercadoLivreConnected && mlApiStatus && (
            <div style={{
              background: 'var(--bg-surface, rgba(255,255,255,0.04))',
              borderRadius: 10,
              padding: '4px 0',
              marginBottom: 16,
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))'
            }}>
              {mlApiStatus.nickname && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nickname</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{mlApiStatus.nickname}</span>
                </div>
              )}
              {mlApiStatus.email && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>E-mail</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{mlApiStatus.email}</span>
                </div>
              )}
              {mlApiStatus.mlUserId && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>User ID</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{mlApiStatus.mlUserId}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Link Afiliado</span>
                <span
                  className={`badge ${mlApiStatus?.integration?.affiliateCookieStatus === 'active' ? 'badge-green' : 'badge-yellow'}`}
                  style={{ fontSize: 10, padding: '2px 8px' }}
                >
                  {mlApiStatus?.integration?.affiliateCookieStatus === 'active' ? '✓ Ativo' : '⏳ Pendente'}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            {!mercadoLivreLoading && mercadoLivreConnected ? (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={checkMlApiStatus}
                  disabled={checkingApiStatus}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {checkingApiStatus
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : <RefreshCw size={14} />}
                  Verificar
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setShowDisconnectModal(true)}
                  disabled={disconnectingMl}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {disconnectingMl
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Trash2 size={14} />}
                  Desconectar
                </button>
              </>
            ) : (
              <div style={{ width: '100%' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: '1.4' }}>
                  ⚠️ A conexão automática requer credenciais configuradas no <code style={{ color: 'var(--text-primary)', background: 'rgba(255,255,255,0.05)', padding: '2px 4px', borderRadius: 4 }}>.env</code>. Caso não as tenha, preencha a <strong>Configuração Manual</strong> abaixo.
                </p>
                <button
                  className="btn btn-yellow"
                  onClick={handleConnectML}
                  disabled={syncing === 'ml' || mercadoLivreLoading}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {syncing === 'ml'
                    ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    : <ExternalLink size={16} />}
                  Conectar Mercado Livre
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Shopee Card ── */}
        <div className="integration-card integration-card-shopee">
          {/* Card Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'rgba(238, 77, 45, 0.08)',
                border: '1px solid rgba(238, 77, 45, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#ee4d2d', flexShrink: 0
              }}>
                <ShoppingBag size={22} />
              </div>
              <div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Shopee
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, margin: '3px 0 0' }}>Open API · Afiliados</p>
              </div>
            </div>

            {/* Status Badge */}
            {shopeeIntegration ? (
              <div className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <Sparkles size={10} /> Conectado
              </div>
            ) : (
              <div className="badge badge-gray" style={{ flexShrink: 0 }}>Desconectado</div>
            )}
          </div>

          {/* Connected state */}
          {shopeeIntegration ? (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => handleDisconnect(shopeeIntegration.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> Desconectar Shopee
            </button>
          ) : (
            <>
              <button
                className="btn btn-sm"
                onClick={() => setIsShopeeFormOpen(!isShopeeFormOpen)}
                style={{
                  width: '100%',
                  background: '#ee4d2d',
                  color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  marginBottom: isShopeeFormOpen ? 14 : 0
                }}
              >
                <Settings size={14} /> Configurar Credenciais
              </button>

              {isShopeeFormOpen && (
                <form onSubmit={saveShopee} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="form-label">App ID</label>
                    <input
                      type="text"
                      required
                      value={shopeeAppId}
                      onChange={e => setShopeeAppId(e.target.value)}
                      className="form-input"
                      placeholder="Seu App ID Shopee"
                    />
                  </div>
                  <div>
                    <label className="form-label">App Secret</label>
                    <input
                      type="password"
                      required
                      value={shopeeAppSecret}
                      onChange={e => setShopeeAppSecret(e.target.value)}
                      className="form-input"
                      placeholder="••••••••"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingShopee}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    {savingShopee && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                    {savingShopee ? 'Salvando...' : 'Salvar'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {/* ── Amazon Card — Coming Soon ── */}
        <div className="integration-card" style={{ opacity: 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'rgba(249, 115, 22, 0.08)',
                border: '1px solid rgba(249, 115, 22, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#ea580c', flexShrink: 0
              }}>
                <Package size={22} />
              </div>
              <div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Amazon
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, margin: '3px 0 0' }}>Associates API</p>
              </div>
            </div>
            <div className="badge badge-gray" style={{ flexShrink: 0 }}>Em breve</div>
          </div>
          <button
            disabled
            className="btn btn-secondary"
            style={{ width: '100%', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            Disponível em breve
          </button>
        </div>

      </div>

      {/* ── Affiliate Config Form & Link Tester (Sempre visível para permitir configuração manual via Cookie) ── */}
      {true && (
        <div style={{
          marginTop: 28,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
          borderRadius: 16,
          padding: 28,
          boxShadow: 'var(--shadow-md)'
        }} className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <Zap size={20} color="var(--green)" />
            <h3 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 16, fontWeight: 700,
              color: 'var(--text-primary)', margin: 0
            }}>
              Configuração e Teste de Links Afiliados
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28 }}>
            
            {/* Form Column */}
            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tag / ID de Afiliado</span>
                  <span style={{ textTransform: 'none', color: 'var(--text-muted)' }}>Ex: MLB1234567</span>
                </label>
                <input
                  type="text"
                  required
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  className="form-input"
                  placeholder="Ex: MLB1234567"
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cookies do Link Builder</span>
                  <span
                    style={{ textTransform: 'none', color: 'var(--green)', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => alert("Como obter os cookies:\n1. Acesse o site do Mercado Livre e faça login como afiliado.\n2. Abra as Ferramentas do Desenvolvedor (F12) -> aba Network (Rede).\n3. Visite a página de Afiliados (Link Builder).\n4. Clique na requisição e copie os Cookies do cabeçalho de solicitação (Request Headers).\n5. Cole aqui no campo.")}
                  >
                    Como pegar?
                  </span>
                </label>
                <textarea
                  value={cookieInput}
                  onChange={e => setCookieInput(e.target.value)}
                  className="form-input form-textarea"
                  placeholder="Cole aqui os cookies obtidos do navegador (deixe em branco para não alterar)"
                  style={{ minHeight: 90 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: mlCookieConfig?.hasCookie ? 'var(--green)' : 'var(--text-muted)' }}>
                    {mlCookieConfig?.hasCookie 
                      ? `Cookies Salvos (${mlCookieConfig.affiliateCookieStatus === 'active' || mlCookieConfig.affiliateCookieStatus === 'valid' ? 'Ativos' : 'Expirados'})` 
                      : 'Nenhum Cookie Configurado'}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {savingConfig && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                  Salvar
                </button>
              </div>
            </form>

            {/* Test Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, borderLeft: '1px solid var(--border-subtle)', paddingLeft: 28 }}>
              <h4 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Testador de Link em Tempo Real
              </h4>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Cole uma URL original de produto do Mercado Livre abaixo para validar se a conversão de afiliados está ativa e retornando o link correto.
              </p>

              <form onSubmit={handleTestConversion} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  required
                  value={testUrl}
                  onChange={e => setTestUrl(e.target.value)}
                  className="form-input"
                  placeholder="https://produto.mercadolivre.com.br/..."
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  disabled={testingUrl}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {testingUrl ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : 'Testar'}
                </button>
              </form>

              {/* Test Result Display */}
              {testResult && (
                <div style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${testResult.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  animation: 'slideInUp 0.25s var(--ease-spring)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 14 }}>{testResult.ok ? '✅' : '❌'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: testResult.ok ? 'var(--green)' : '#f87171' }}>
                      {testResult.ok ? `Sucesso via: ${testResult.method}` : 'Erro na Conversão'}
                    </span>
                  </div>

                  {testResult.ok && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Link Gerado:</span>
                      <a
                        href={testResult.affiliateUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', textDecoration: 'underline', wordBreak: 'break-all' }}
                      >
                        {testResult.affiliateUrl}
                      </a>
                    </div>
                  )}

                  {!testResult.ok && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, wordBreak: 'break-all' }}>
                      {testResult.error || 'Código de cookie expirado ou inválido. O sistema usará o link padrão de fallback.'}
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Disconnect Confirmation Modal ── */}
      {showDisconnectModal && (
        <div className="modal-overlay" onClick={() => setShowDisconnectModal(false)}>
          <div className="modal-content" style={{ padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <Trash2 size={20} color="#f87171" />
              </div>
              <h2 style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 18, fontWeight: 700,
                color: 'var(--text-primary)', margin: 0
              }}>
                Desconectar Mercado Livre?
              </h2>
            </div>

            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 24px' }}>
              Sua conta será desconectada e o Zappio deixará de acessar dados do Mercado Livre até uma nova conexão.
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnectingMl}
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDisconnectMl}
                disabled={disconnectingMl}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {disconnectingMl && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                {disconnectingMl ? 'Desconectando...' : 'Desconectar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
