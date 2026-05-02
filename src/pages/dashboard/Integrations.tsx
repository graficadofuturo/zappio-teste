import { useState, useEffect } from 'react';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { Megaphone, ShoppingCart, Loader2, Sparkles, AlertCircle, Trash2, Key, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function Integrations() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [manualClientId, setManualClientId] = useState('');
  const [manualClientSecret, setManualClientSecret] = useState('');
  const [manualSellerId, setManualSellerId] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    loadIntegrations();
    
    const mlStatus = searchParams.get('mercadolivre');
    if (mlStatus) {
      if (mlStatus === 'connected') {
         setMessage({ type: 'success', text: 'Mercado Livre conectado com sucesso.' });
      } else if (mlStatus === 'error' || mlStatus === 'oauth_error') {
         setMessage({ type: 'error', text: 'Não foi possível conectar ao Mercado Livre.' });
      } else if (mlStatus === 'missing_code') {
         setMessage({ type: 'error', text: 'O Mercado Livre não retornou o código de autorização. Tente conectar novamente.' });
      } else if (mlStatus === 'invalid_state') {
         setMessage({ type: 'error', text: 'Sessão de conexão expirada. Tente conectar novamente.' });
      } else if (mlStatus === 'token_error') {
         setMessage({ type: 'error', text: 'Erro ao trocar autorização por token. Verifique as configurações do Mercado Livre.' });
      } else if (mlStatus === 'config_error') {
         setMessage({ type: 'error', text: 'As configurações do Mercado Livre estão incompletas.' });
      } else if (mlStatus === 'save_error') {
         setMessage({ type: 'error', text: 'A conexão funcionou, mas não foi possível salvar a integração.' });
      }
      // Remove param to prevent showing again on reload
      navigate('/dashboard/integrations', { replace: true });
    }
  }, [searchParams, navigate]);

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
          
          alert("Integração salva usando modo avançado! Você já pode sincronizar os produtos.");

      } catch(e) {
          alert('Erro ao salvar manualmente');
      }
      setSavingManual(false);
  };

  const handleDisconnect = async (id: string) => {
      if (!confirm('Deseja realmente desconectar esta integração?')) return;
      try {
          await deleteDoc(doc(db, 'ecommerce_keys', id));
          await loadIntegrations();
      } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, 'ecommerce_keys');
      }
  };

  const handleSyncML = async (integrationId: string) => {
      setSyncing(integrationId);
      try {
          const res = await fetch('/api/integrations/mercadolivre/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ integrationId })
          });
          const data = await res.json();
          if (data.success) {
              alert(`Produtos sincronizados: ${data.count}`);
              await loadIntegrations();
          } else {
              alert('Erro na sincronização: ' + data.error);
          }
      } catch (e: any) {
          alert('Erro ao sincronizar: ' + e.message);
      } finally {
          setSyncing(null);
      }
  };

  const mlIntegration = integrations.find(i => i.platform === 'mercadolivre' || i.platform === 'mercado_livre');

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-[20px] font-bold text-primary">Integrações</h1>
        <p className="text-[13px] text-secondary mt-1">Conecte suas contas para puxar produtos, imagens e preços automaticamente.</p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.type === 'success' ? <Sparkles className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <p className="text-[14px] font-medium">{message.text}</p>
        </div>
      )}

      {loading && integrations.length === 0 ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
        {/* ML Card */}
        <div className="bg-primary border border-subtle rounded-xl p-6 flex flex-col h-full hover:border-[#ffe600] transition-colors relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-[#ffe600]"></div>
            
            <div className="flex items-start justify-between mb-4 mt-2">
                <div>
                   <h3 className="text-[16px] font-bold text-primary flex items-center gap-2">Mercado Livre</h3>
                   <p className="text-[12px] text-secondary mt-1 max-w-[200px]">Conecte sua conta para puxar produtos automaticamente.</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[#ffe600]/10 flex items-center justify-center font-bold text-[#2d3277] border border-[#ffe600]/30">
                  ML
                </div>
            </div>

            <div className="mt-auto pt-4 border-t border-subtle/50">
               {mlIntegration ? (
                   <div className="space-y-4">
                       <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 text-[11px] font-bold uppercase rounded-md border border-green-200 w-max">
                          <Sparkles className="w-3.5 h-3.5" /> Conectado
                       </div>
                       
                       <div className="text-[12px] text-secondary space-y-1 my-3 bg-secondary/30 p-3 rounded-lg border border-subtle/50">
                          <p><strong>Loja / Seller ID:</strong> {mlIntegration.ml_user_id || 'Não identificado'}</p>
                          <p><strong>Produtos Importados:</strong> {mlIntegration.sync_count || 0}</p>
                          <p><strong>Última Sincronização:</strong> {mlIntegration.last_synced_at ? new Date(mlIntegration.last_synced_at?.seconds * 1000).toLocaleString() : 'Nunca'}</p>
                       </div>
                       
                       <div className="flex gap-2">
                           <button 
                             onClick={() => handleSyncML(mlIntegration.id)}
                             disabled={syncing === mlIntegration.id}
                             className="flex-1 bg-accent-blue text-white px-4 py-2 rounded-lg font-semibold text-[13px] flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                           >
                             {syncing === mlIntegration.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4"/>}
                             Sincronizar
                           </button>
                           <button 
                             onClick={() => navigate('/dashboard/products')}
                             className="flex-1 bg-secondary text-primary px-4 py-2 rounded-lg font-semibold text-[13px] flex items-center justify-center gap-2 hover:bg-gray-100"
                           >
                             Ver Produtos
                           </button>
                       </div>
                       <button 
                         onClick={() => handleDisconnect(mlIntegration.id)}
                         className="w-full text-red-500 text-[12px] font-semibold mt-2 hover:underline flex items-center justify-center gap-1"
                       >
                         <Trash2 className="w-3 h-3" /> Desconectar
                       </button>
                   </div>
               ) : (
                   <div className="space-y-4">
                       <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-secondary text-[11px] font-bold uppercase rounded-md border border-subtle w-max">
                           Não conectado
                       </div>
                       
                       <button 
                         onClick={() => {
                             window.location.href = "/api/integrations/mercadolivre/connect?userId=" + auth.currentUser?.uid;
                         }}
                         className={`w-full bg-[#ffe600] text-[#2d3277] border border-[#ffe600] px-4 py-3 rounded-lg font-bold text-[14px] flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all shadow-sm ${syncing === 'ml' ? 'pointer-events-none opacity-50' : ''}`}
                       >
                         {syncing === 'ml' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                         Conectar Autenticando (OAuth)
                       </button>

                       {/* Advanced Mode */}
                       <div className="mt-4 pt-4 border-t border-subtle/50">
                           <button 
                              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                              className="text-[12px] text-secondary font-semibold flex items-center justify-center gap-1 w-full hover:text-primary transition-colors"
                           >
                              <Key className="w-3 h-3" /> Fazer conexão manual
                              {isAdvancedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                           </button>
                           
                           {isAdvancedOpen && (
                              <form onSubmit={saveManualML} className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300 bg-secondary/50 p-4 rounded-xl border border-subtle/50">
                                 <p className="text-[11px] text-secondary mb-3 leading-relaxed">
                                   Insira o seu <strong>Seller ID</strong> do Mercado Livre. As chaves de Client são opcionais.
                                 </p>
                                 <div>
                                   <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-1">Seller / User ID</label>
                                   <input type="text" required value={manualSellerId} onChange={e=>setManualSellerId(e.target.value)} className="w-full p-2 bg-primary border border-subtle rounded-md text-[13px]" placeholder="Ex: 123456789" />
                                 </div>
                                 <details className="mt-2 text-[11px] text-secondary">
                                    <summary className="cursor-pointer font-semibold uppercase tracking-wider mb-2">Chaves Opcionais</summary>
                                    <div className="space-y-3 mt-2 pl-2">
                                        <div>
                                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-1">Client ID (App ID)</label>
                                          <input type="text" value={manualClientId} onChange={e=>setManualClientId(e.target.value)} className="w-full p-2 bg-primary border border-subtle rounded-md text-[13px]" />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-1">Client Secret</label>
                                          <input type="password" value={manualClientSecret} onChange={e=>setManualClientSecret(e.target.value)} className="w-full p-2 bg-primary border border-subtle rounded-md text-[13px]" />
                                        </div>
                                    </div>
                                 </details>
                                 <button type="submit" disabled={savingManual} className="w-full bg-accent-blue text-white py-2 rounded-md text-[12px] font-semibold flex items-center justify-center gap-2 mt-3 cursor-pointer hover:bg-blue-700">
                                     {savingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Manualmente e Sincronizar'}
                                 </button>
                              </form>
                           )}
                       </div>

                   </div>
               )}
            </div>
        </div>
        
        {/* Amazon Card placeholder if needed */}
        <div className="bg-primary border border-subtle rounded-xl p-6 flex items-center justify-center opacity-50 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-[#ff9900]"></div>
             <div className="text-center">
                 <h3 className="text-[16px] font-bold text-primary mb-2">Amazon Prime</h3>
                 <p className="text-[12px] text-secondary">Em Breve...</p>
             </div>
        </div>

      </div>
      )}
    </div>
  );
}
