import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';
import { ShoppingBag, Loader2, Sparkles, AlertCircle, Trash2, Key, RefreshCw, ChevronDown, ChevronUp, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function Integrations() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [mlApiStatus, setMlApiStatus] = useState<any>(null);
  const [checkingApiStatus, setCheckingApiStatus] = useState(false);

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [manualClientId, setManualClientId] = useState('');
  const [manualClientSecret, setManualClientSecret] = useState('');
  const [manualSellerId, setManualSellerId] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  const [shopeeAppId, setShopeeAppId] = useState('');
  const [shopeeAppSecret, setShopeeAppSecret] = useState('');
  const [isShopeeFormOpen, setIsShopeeFormOpen] = useState(false);
  const [savingShopee, setSavingShopee] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    loadIntegrations();
    checkMlApiStatus();
    
    const mlStatus = searchParams.get('mercadolivre');
    if (mlStatus) {
      if (mlStatus === 'connected') {
         setMessage({ type: 'success', text: 'Mercado Livre conectado com sucesso.' });
         checkMlApiStatus();
      } else if (mlStatus === 'missing_code') {
         setMessage({ type: 'error', text: 'O Mercado Livre não retornou o código de autorização. Tente conectar novamente.' });
      } else if (mlStatus === 'invalid_state') {
         setMessage({ type: 'error', text: 'Sessão de conexão expirada. Tente conectar novamente.' });
      } else if (mlStatus === 'token_error') {
         setMessage({ type: 'error', text: 'Erro ao trocar autorização por token. Verifique as configurações do Mercado Livre.' });
      } else if (mlStatus === 'config_error') {
         setMessage({ type: 'error', text: 'As configurações do Mercado Livre estão incompletas.' });
      } else if (mlStatus === 'firestore_not_found') {
         setMessage({ type: 'error', text: 'Firestore não encontrado. Verifique o banco de dados.' });
      } else if (mlStatus === 'save_error') {
         setMessage({ type: 'error', text: 'A conexão funcionou, mas não foi possível salvar a integração.' });
      } else if (mlStatus === 'error') {
         setMessage({ type: 'error', text: 'Não foi possível conectar ao Mercado Livre.' });
      } else {
         setMessage({ type: 'error', text: `Erro Mercado Livre: ${mlStatus}` });
      }
      // Remove param to prevent showing again on reload
      navigate('/integrations', { replace: true });
    }
  }, [searchParams, navigate]);

  const handleConnectML = async () => {
    try {
      setSyncing('ml');
      setMessage(null);
  
      console.log("CONNECT_ML_CLICKED");
  
      const response = await fetch("/api/integrations/mercadolivre/auth-url", {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
  
      const text = await response.text();
  
      console.log("CONNECT_ML_RAW_RESPONSE", text);
  
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error("A rota de conexão não retornou JSON válido. " + text.substring(0, 50));
      }
  
      console.log("CONNECT_ML_AUTH_URL_RESPONSE", data);
  
      if (!response.ok || !data.ok || !data.authorizationUrl) {
        throw new Error(data.message || "Não foi possível iniciar a conexão.");
      }
  
      window.location.href = data.authorizationUrl;
    } catch (e: any) {
      console.error("CONNECT_ML_ERROR", e);
      setMessage({ type: 'error', text: e.message || "Não foi possível iniciar a conexão." });
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
    try {
      const user = auth.currentUser;
      const res = await fetch(`/api/integrations/mercadolivre/status${user ? `?userId=${user.uid}` : ''}`);
      const data = await res.json();
      setMlApiStatus(data);
    } catch (e) {
      console.error("Error checking ML status:", e);
    } finally {
      setCheckingApiStatus(false);
    }
  };

  const saveManualML = async (e: React.FormEvent) => {
      e.preventDefault();
      setSavingManual(true);
      try {
          const user = auth.currentUser;
          if (!user) return;
          
          const payload: any = {
              user_id: user.uid,
              platform: 'mercadolivre',
              api_key: manualClientId,
              api_secret: manualClientSecret,
              ml_user_id: manualSellerId,
              status: 'connected',
              sync_count: 0,
              updated_at: new Date()
          };
          
          await addDoc(collection(db, 'ecommerce_keys'), payload);
          setManualClientId('');
          setManualClientSecret('');
          setManualSellerId('');
          setIsAdvancedOpen(false);
          await loadIntegrations();
          
          setMessage({ type: 'success', text: "Integração salva usando modo avançado! Você já pode sincronizar os produtos." });
          setTimeout(() => setMessage(null), 5000);

      } catch(e) {
          setMessage({ type: 'error', text: 'Erro ao salvar manualmente.' });
      }
      setSavingManual(false);
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
          
          setMessage({ type: 'success', text: "Shopee conectada com sucesso!" });
          setTimeout(() => setMessage(null), 5000);

      } catch(e) {
          setMessage({ type: 'error', text: 'Erro ao salvar Shopee.' });
      }
      setSavingShopee(false);
  };

  const handleDisconnect = async (id: string, platform?: string) => {
      if (!confirm('Deseja realmente desconectar esta integração?')) return;
      try {
          // If we saved ML into users/{uid}/integrations/mercadolivre, we should also delete from there. 
          // The manual or legacy ones are in `ecommerce_keys`. We will try deleting both to be safe.
          try {
            await deleteDoc(doc(db, 'ecommerce_keys', id));
          } catch(e) {}
          
          if (platform === 'mercadolivre') {
            const user = auth.currentUser;
            if (user) {
               try {
                  await deleteDoc(doc(db, 'users', user.uid, 'integrations', 'mercadolivre'));
               } catch(e) {}
            }
            setMlApiStatus(null);
            checkMlApiStatus();
          }

          await loadIntegrations();
          setMessage({ type: 'success', text: 'Integração desconectada com sucesso.' });
          setTimeout(() => setMessage(null), 5000);
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
                     <p className="text-[13px] text-gray-500 mt-1 leading-relaxed pr-4">Importe seus anúncios e produtos de afiliados diretamente.</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <ShoppingBag className="w-6 h-6 text-yellow-600" />
                  </div>
              </div>

              <div className="mt-6">
                 {mlApiStatus?.connected ? (
                     <div className="space-y-5">
                         <div className="flex items-center gap-2 px-2.5 py-1 bg-green-50 text-green-700 text-[11px] font-bold uppercase tracking-wider rounded border border-green-200 w-max">
                            <Sparkles className="w-3.5 h-3.5" /> Conectado
                         </div>
                         
                         <div className="text-[13px] text-gray-700 space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div className="flex justify-between items-center pb-2 border-b border-gray-200/50">
                               <span className="text-gray-500">Conta:</span>
                               <span className="font-semibold">{mlApiStatus.account_name || mlApiStatus.nickname || mlApiStatus.seller_id}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1">
                               <span className="text-gray-500">Autorizado:</span>
                               <span className="font-medium text-[12px]">{mlApiStatus.connected_at ? new Date(mlApiStatus.connected_at).toLocaleDateString() : 'Desconhecido'}</span>
                            </div>
                         </div>
                         
                         <div className="flex flex-col gap-2 pt-2">
                             <div className="flex gap-2">
                               <button 
                                 onClick={handleConnectML}
                                 className="flex-1 bg-white border border-gray-200 text-gray-700 py-2 rounded-lg font-medium text-[13px] flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm"
                               >
                                 Reconectar
                               </button>
                               <button 
                                 onClick={checkMlApiStatus}
                                 disabled={checkingApiStatus}
                                 className="flex-1 bg-white border border-gray-200 text-gray-700 py-2 rounded-lg font-medium text-[13px] flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                               >
                                 {checkingApiStatus ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <RefreshCw className="w-4 h-4 text-gray-400"/>}
                                 Atualizar
                               </button>
                             </div>
                             {mlApiStatus?.connected && (
                               <button 
                                 onClick={() => handleDisconnect(mlIntegration?.id || String(mlApiStatus.mlUserId) || 'mercadolivre', 'mercadolivre')}
                                 className="w-full text-red-600 bg-red-50 border border-red-100 py-2 rounded-lg text-[13px] font-medium transition-colors hover:bg-red-100 flex items-center justify-center gap-2 mt-2"
                               >
                                 <Trash2 className="w-4 h-4" /> Desconectar conta
                               </button>
                             )}
                         </div>
                     </div>
                 ) : (
                     <div className="space-y-5">
                         <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-100 text-gray-600 text-[11px] font-bold uppercase tracking-wider rounded border border-gray-200 w-max">
                                 {checkingApiStatus && !mlApiStatus ? 'Verificando...' : 'Não Conectado'}
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
  
                         {/* Advanced Mode */}
                         <div className="pt-2">
                             <button 
                                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                                className="text-[13px] text-gray-500 font-medium flex items-center justify-center gap-1.5 w-full hover:text-gray-900 transition-colors"
                             >
                                <Key className="w-3.5 h-3.5" /> Conexão avançada (Manual)
                                {isAdvancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                             </button>
                             
                             {isAdvancedOpen && (
                                <form onSubmit={saveManualML} className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                   <p className="text-[12px] text-gray-500 leading-relaxed">
                                     Utilize esta opção se você já tem um Token de Afiliado ou deseja configurar sua Api Key manualmente.
                                   </p>
                                   <div>
                                     <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-600 mb-1.5">Seller ID / User ID</label>
                                     <input type="text" required value={manualSellerId} onChange={e=>setManualSellerId(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[13px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="Ex: 123456789" />
                                   </div>
                                   <details className="mt-2 text-[12px] text-gray-600 group">
                                      <summary className="cursor-pointer font-semibold mb-2 select-none">Mostrar campos de Chave (Opcional)</summary>
                                      <div className="space-y-4 mt-3 pl-1 border-l-2 border-gray-200">
                                          <div className="pl-3">
                                            <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Client ID (App ID)</label>
                                            <input type="text" value={manualClientId} onChange={e=>setManualClientId(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[13px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                                          </div>
                                          <div className="pl-3">
                                            <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Client Secret</label>
                                            <input type="password" value={manualClientSecret} onChange={e=>setManualClientSecret(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[13px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                                          </div>
                                      </div>
                                   </details>
                                   <button type="submit" disabled={savingManual} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 mt-4 hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50">
                                       {savingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Integração'}
                                   </button>
                                </form>
                             )}
                         </div>
  
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
    </div>
  );
}
