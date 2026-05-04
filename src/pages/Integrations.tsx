import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';
import { ShoppingBag, Loader2, Sparkles, AlertCircle, Trash2, Key, RefreshCw, ChevronDown, ChevronUp, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

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

  useEffect(() => {
    loadIntegrations();
    
    const params = new URLSearchParams(window.location.search);
    const mlParam = params.get("mercadolivre");
    
    console.log("ML_URL_PARAM", mlParam);
    console.log("ML_CONNECTED_FROM_URL", mlParam === "connected");

    if (mlParam) {
      window.history.replaceState({}, '', '/integrations');
    }

    if (mlParam && mlParam !== "connected") {
      if (mlParam === 'missing_code') {
        showError('O Mercado Livre não retornou o código de autorização. Tente conectar novamente.');
      } else if (mlParam === 'invalid_state') {
        showError('Sessão de conexão expirada. Tente conectar novamente.');
      } else if (mlParam === 'token_error') {
        showError('Erro ao trocar autorização por token. Verifique as configurações do Mercado Livre.');
      } else if (mlParam === 'config_error') {
        showError('As configurações do Mercado Livre estão incompletas.');
      } else if (mlParam === 'firestore_not_found') {
        showError('Firestore não encontrado. Verifique o banco de dados.');
      } else if (mlParam === 'save_error') {
        const errorDetails = searchParams.get('errorDetails');
        showError(`A conexão funcionou, mas não foi possível salvar a integração. Erro: ${errorDetails || 'Desconhecido'}`);
      } else if (mlParam === 'missing_user') {
        showError('Usuário não identificado. Tente fazer login novamente antes de conectar.');
      } else if (mlParam === 'error') {
        showError('Não foi possível conectar ao Mercado Livre.');
      } else {
        showError(`Erro Mercado Livre: ${mlParam}`);
      }
    }

    async function checkStatus() {
      try {
        setMercadoLivreLoading(true);
        setCheckingApiStatus(true);
        
        // Use auth.onAuthStateChanged if currentUser is not immediately available on mount
        const fetchStatus = async () => {
          const user = auth.currentUser;
          const url = user ? `/api/mercadolivre?action=status&uid=${user.uid}` : `/api/mercadolivre?action=status`;
          
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Accept": "application/json"
            }
          });

          const data = await response.json();
          console.log("ML_STATUS_FRONTEND_RESPONSE", data);
          
          setMlApiStatus(data);
          const isReallyConnected = data.connected === true;
          setMercadoLivreConnected(isReallyConnected);

          if (!data.ok) {
            showError(`Erro ao verificar conexão: ${data.error || "Desconhecido"}`);
          }

          if (mlParam === "connected") {
            if (isReallyConnected) {
              showSuccess('Mercado Livre conectado com sucesso.');
            } else {
              showError("Conexão autorizada, mas a integração não foi encontrada no banco de dados. Tente conectar novamente.");
            }
          } else if (mlParam === 'save_error') {
            const errorDetails = searchParams.get('errorDetails');
            showError(`A conta foi autorizada, mas não foi possível salvar a integração. Erro: ${errorDetails || 'Verifique o banco de dados e tente novamente.'}`);
          } else if (mlParam === 'missing_uid') {
            showError('A conta foi autorizada, mas não identificamos o seu usuário ao voltar. Faça login e tente novamente.');
          }
        };

        if (auth.currentUser) {
          await fetchStatus();
          setMercadoLivreLoading(false);
          setCheckingApiStatus(false);
        } else {
          // If not loaded yet, wait for it
          const unsubscribe = auth.onAuthStateChanged(async (user) => {
            try {
              if (user) {
                await fetchStatus();
              } else {
                await fetchStatus();
              }
            } finally {
              setMercadoLivreLoading(false);
              setCheckingApiStatus(false);
            }
            unsubscribe();
          });
        }

      } catch (error) {
        console.error("ML_STATUS_ERROR", error);
        setMercadoLivreConnected(false);
        setMercadoLivreLoading(false);
        setCheckingApiStatus(false);
      }
    }

    checkStatus();
  }, [searchParams, navigate]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkMlApiStatus();
        setMessage({ type: 'success', text: 'Mercado Livre conectado com sucesso.' });
        setTimeout(() => setMessage(null), 5000);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectML = async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Usuário não logado");
      
      setSyncing('ml');
      setMessage(null);
  
      console.log("CONNECT_ML_CLICKED");
  
      const response = await fetch(`/api/mercadolivre/auth?uid=${user.uid}`, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
  
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("ML_AUTH_URL_NON_JSON_RESPONSE", `Status: ${response.status}, Resposta: ${text}`);
        throw new Error("Rota auth-url retornou HTML. Verifique se a função existe na Vercel.");
      }
  
      const data = await response.json();
      console.log("CONNECT_ML_AUTH_URL_RESPONSE", data);
  
      if (!response.ok || !data.ok || !data.authorizationUrl) {
        throw new Error(data.message || data.error || "Não foi possível iniciar a conexão.");
      }
  
      window.location.href = data.authorizationUrl;
    } catch (e: any) {
      console.error("CONNECT_ML_ERROR", e);
      showError(e.message || "Não foi possível iniciar a conexão.");
    } finally {
      setSyncing(null);
    }
  };

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const q = query(collection(db, 'ecommerce_keys'), where('user_id', '==', user.uid));
        const querySnapshot = await getDocs(q);
        setIntegrations(querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'ecommerce_keys');
    }
    setLoading(false);
  };

  const checkMlApiStatus = async () => {
    setCheckingApiStatus(true);
    setMercadoLivreLoading(true);
    try {
      const user = auth.currentUser;
      const url = user ? `/api/mercadolivre?action=status&uid=${user.uid}` : `/api/mercadolivre?action=status`;
      const res = await fetch(url);
      const data = await res.json();
      console.log("ML_STATUS_FRONTEND_RESPONSE", data);
      setMlApiStatus(data);
      if (data.ok && data.connected) {
         setMercadoLivreConnected(true);
      } else {
         setMercadoLivreConnected(false);
      }
    } catch (e) {
      console.error("Error checking ML status:", e);
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
          const user = auth.currentUser;
          if (!user) return;
          
          const payload: any = {
              user_id: user.uid,
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
          
          showSuccess("Shopee conectada com sucesso!");

      } catch(e) {
          showError('Erro ao salvar Shopee.');
      }
      setSavingShopee(false);
  };

  const handleDisconnectMl = async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Usuário não logado");
      
      setDisconnectingMl(true);
      setShowDisconnectModal(false);
      
      const response = await fetch(`/api/mercadolivre`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", uid: user.uid })
      });
      
      const data = await response.json();
      console.log("ML_DISCONNECT_RESPONSE", data);
      
      if (!data.ok) {
        throw new Error(data.error || "Erro ao desconectar Mercado Livre.");
      }
      
      setMercadoLivreConnected(false);
      setMlApiStatus(data);
      
      showSuccess("Mercado Livre desconectado com sucesso.");
      await checkMlApiStatus();
    } catch (error) {
      console.error("ML_DISCONNECT_FRONT_ERROR", error);
      showError("Não foi possível desconectar o Mercado Livre.");
    } finally {
      setDisconnectingMl(false);
    }
  };

  const handleSyncMl = async () => {
    try {
      setSyncingMl(true);
      const response = await fetch("/api/integrations/mercadolivre/sync", {
        method: "POST"
      });
      
      const data = await response.json();
      console.log("ML_SYNC_RESPONSE", data);
      
      if (!data.ok) {
        throw new Error(data.error || "Erro ao sincronizar Mercado Livre.");
      }
      
      setMlApiStatus(data);
      showSuccess("Mercado Livre sincronizado com sucesso.");
    } catch (error) {
      console.error("ML_SYNC_FRONT_ERROR", error);
      showError("Não foi possível sincronizar. Reconecte o Mercado Livre.");
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
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-bold text-gray-900">Integrações</h1>
        <p className="text-[14px] text-gray-500 mt-1 max-w-2xl">Conecte suas contas de marketplaces para importar produtos, imagens e links automaticamente para suas campanhas.</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-[13px] font-medium flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      {loading && integrations.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-gray-400">
           <Loader2 className="w-8 h-8 animate-spin mb-4" />
           <span className="text-[13px] font-medium">Carregando integrações...</span>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
          
        {/* ML Card */}
        <div className="bg-white border border-gray-200 rounded-2xl flex flex-col h-full shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-[#ffe600]"></div>
            
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                  <div>
                     <h3 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">Mercado Livre</h3>
                     <p className="text-[13px] text-gray-500 mt-1 leading-relaxed pr-4">
                       {mercadoLivreConnected ? "Conta Mercado Livre conectada e pronta para buscar ofertas." : "Importe seus anúncios e produtos de afiliados diretamente."}
                     </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <ShoppingBag className="w-6 h-6 text-yellow-600" />
                  </div>
              </div>

              <div className="mt-6">
                 {mercadoLivreLoading ? (
                     <div className="space-y-5">
                         <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-100 text-gray-600 text-[11px] font-bold uppercase tracking-wider rounded border border-gray-200 w-max">
                            <Loader2 className="w-3 h-3 animate-spin"/> VERIFICANDO...
                         </div>
                     </div>
                 ) : mercadoLivreConnected ? (
                     <div className="space-y-5">
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2 px-2.5 py-1 bg-green-50 text-green-700 text-[11px] font-bold uppercase tracking-wider rounded border border-green-200 w-max">
                                <Sparkles className="w-3.5 h-3.5" /> CONECTADO
                             </div>
                             <button onClick={checkMlApiStatus} disabled={checkingApiStatus} className="text-[12px] text-gray-500 hover:text-indigo-600 flex items-center gap-1 font-medium transition-colors">
                                 {checkingApiStatus ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3"/>}
                                 Verificar
                             </button>
                         </div>
                         
                         {mlApiStatus && mlApiStatus.connected && (
                           <div className="text-[13px] text-gray-700 space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                              {mlApiStatus.mlUserId && (
                                <div className="flex justify-between items-center pb-2 border-b border-gray-200/50">
                                   <span className="text-gray-500">User ID:</span>
                                   <span className="font-semibold">{mlApiStatus.mlUserId}</span>
                                </div>
                              )}
                              {mlApiStatus.nickname && (
                                <div className="flex justify-between items-center py-2 border-b border-gray-200/50">
                                   <span className="text-gray-500">Nickname:</span>
                                   <span className="font-semibold">{mlApiStatus.nickname}</span>
                                </div>
                              )}
                              {mlApiStatus.email && (
                                <div className="flex justify-between items-center py-2 border-b border-gray-200/50">
                                   <span className="text-gray-500">E-mail:</span>
                                   <span className="font-semibold">{mlApiStatus.email}</span>
                                </div>
                              )}
                           </div>
                         )}
                         
                         <div className="flex flex-col gap-2 pt-2">
                             <div className="flex flex-col sm:flex-row gap-2">
                               <button 
                                 onClick={() => setShowDisconnectModal(true)}
                                 disabled={disconnectingMl}
                                 className="flex-1 text-red-600 bg-red-50 border border-red-100 py-2 rounded-lg text-[13px] font-medium transition-colors hover:bg-red-100 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                               >
                                 {disconnectingMl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                 {disconnectingMl ? 'Desconectando...' : 'Desconectar'}
                               </button>
                             </div>
                         </div>
                     </div>
                 ) : (
                     <div className="space-y-5">
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-100 text-gray-600 text-[11px] font-bold uppercase tracking-wider rounded border border-gray-200 w-max">
                                 NÃO CONECTADO
                             </div>
                             <button onClick={checkMlApiStatus} disabled={checkingApiStatus} className="text-[12px] text-gray-500 hover:text-indigo-600 flex items-center gap-1 font-medium transition-colors">
                                 {checkingApiStatus ? <Loader2 className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3"/>}
                                 Verificar
                             </button>
                         </div>
                         
                         <button 
                           onClick={handleConnectML}
                           className={`w-full bg-[#ffe600] text-[#2d3277] hover:bg-[#f5dd00] py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 transition-colors shadow-sm ${syncing === 'ml' ? 'pointer-events-none opacity-50' : ''}`}
                         >
                           {syncing === 'ml' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                           Conectar Mercado Livre
                         </button>
                     </div>
                 )}
              </div>
            </div>
        </div>
        
        {/* Amazon Card */}
        <div className="bg-white border border-gray-200 rounded-2xl flex flex-col h-full shadow-sm relative overflow-hidden opacity-60 grayscale hover:grayscale-0 transition-all cursor-not-allowed">
             <div className="absolute top-0 left-0 w-full h-1.5 bg-[#ff9900]"></div>
             <div className="p-6 flex flex-col h-full">
                 <div className="flex items-start justify-between mb-4">
                     <div>
                        <h3 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">Amazon Prime</h3>
                        <p className="text-[13px] text-gray-500 mt-1 leading-relaxed pr-4">Importe produtos da sua conta de parceiros Amazon.</p>
                     </div>
                     <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                       <ShoppingBag className="w-6 h-6 text-orange-500" />
                     </div>
                 </div>
                 
                 <div className="mt-auto pt-6">
                    <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-100 text-gray-500 text-[11px] font-bold uppercase tracking-wider rounded border border-gray-200 w-max mb-4">
                        Em breve
                    </div>
                    <button disabled className="w-full bg-gray-100 text-gray-400 py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 border border-gray-200">
                      Disponível futuramente
                    </button>
                 </div>
             </div>
        </div>

        {/* Shopee Card */}
        <div className="bg-white border border-gray-200 rounded-2xl flex flex-col h-full shadow-sm relative overflow-hidden transition-all">
             <div className="absolute top-0 left-0 w-full h-1.5 bg-[#ee4d2d]"></div>
             <div className="p-6 flex flex-col h-full">
                 <div className="flex items-start justify-between mb-4">
                     <div>
                        <h3 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">Shopee</h3>
                        <p className="text-[13px] text-gray-500 mt-1 leading-relaxed pr-4">Conecte sua conta de afiliado via Open API.</p>
                     </div>
                     <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                       <ShoppingBag className="w-6 h-6 text-red-500" />
                     </div>
                 </div>
                 
                 <div className="mt-auto pt-6">
                    {shopeeIntegration ? (
                        <div className="space-y-4">
                           <div className="flex items-center gap-2 px-2.5 py-1 bg-green-50 text-green-700 text-[11px] font-bold uppercase tracking-wider rounded border border-green-200 w-max">
                              <Sparkles className="w-3.5 h-3.5" /> Conectado
                           </div>
                           <button 
                             onClick={() => handleDisconnect(shopeeIntegration.id)}
                             className="w-full text-red-600 bg-red-50 border border-red-100 py-2 rounded-lg text-[13px] font-medium transition-colors hover:bg-red-100 flex items-center justify-center gap-2"
                           >
                             <Trash2 className="w-4 h-4" /> Desconectar conta
                           </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <button 
                                onClick={() => setIsShopeeFormOpen(!isShopeeFormOpen)}
                                className="w-full bg-[#ee4d2d] text-white py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 hover:bg-[#d74226] transition-colors shadow-sm"
                            >
                                <ExternalLink className="w-4 h-4" /> Configurar Credenciais
                            </button>
                            
                            {isShopeeFormOpen && (
                                <form onSubmit={saveShopee} className="animate-in fade-in slide-in-from-top-2 duration-200 bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4">
                                   <div>
                                     <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-600 mb-1.5">App ID</label>
                                     <input type="text" required value={shopeeAppId} onChange={e=>setShopeeAppId(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[13px] focus:ring-2 focus:ring-[#ee4d2d]/20 focus:border-[#ee4d2d] outline-none transition-all" />
                                   </div>
                                   <div>
                                     <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-600 mb-1.5">App Secret</label>
                                     <input type="password" required value={shopeeAppSecret} onChange={e=>setShopeeAppSecret(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[13px] focus:ring-2 focus:ring-[#ee4d2d]/20 focus:border-[#ee4d2d] outline-none transition-all" />
                                   </div>
                                   <button type="submit" disabled={savingShopee} className="w-full bg-[#ee4d2d] text-white py-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-[#d74226] transition-colors shadow-sm disabled:opacity-50">
                                       {savingShopee ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                                   </button>
                                </form>
                            )}
                        </div>
                    )}
                 </div>
             </div>
        </div>

      </div>
      )}

      {/* Manage ML Modal removed as per user request */}

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h2 className="text-[18px] font-bold">Desconectar Mercado Livre?</h2>
            </div>
            
            <p className="text-[14px] text-gray-600 leading-relaxed mb-6">
              Sua conta será desconectada e o Zappio deixará de acessar os dados do Mercado Livre até uma nova conexão.
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setShowDisconnectModal(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-semibold text-[14px] hover:bg-gray-50 transition-colors"
                disabled={disconnectingMl}
              >
                Cancelar
              </button>
              <button 
                onClick={handleDisconnectMl}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-[14px] hover:bg-red-700 transition-colors shadow-sm flex items-center justify-center gap-2"
                disabled={disconnectingMl}
              >
                {disconnectingMl ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Desconectar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
