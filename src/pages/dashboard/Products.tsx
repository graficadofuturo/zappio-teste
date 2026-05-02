import { useState, useEffect } from 'react';
import { auth, db } from '../../lib/firebase';
import { updateDoc, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { Loader2, Package, Link as LinkIcon, RefreshCw, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');
  const [syncStatus, setSyncStatus] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    setSyncStatus(null);
    try {
      const user = auth.currentUser;
      if (user) {
        const res = await fetch(`/api/mercadolivre/products?userId=${user.uid}`);
        const data = await res.json();
        
        if (res.ok && data.ok) {
            setProducts(data.products || []);
        } else {
            console.error(data.error);
        }
      }
    } catch (e) {
        console.error("Failed to load ML products:", e);
    }
    setLoading(false);
  };

  const handleSync = async () => {
      setSyncing(true);
      setSyncStatus(null);
      try {
          const user = auth.currentUser;
          if (!user) return;
          
          const res = await fetch('/api/mercadolivre/products/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.uid })
          });
          
          const data = await res.json();
          
          if (!res.ok || !data.ok) {
              if (data.error === 'not_connected') {
                  setSyncStatus({ type: 'error', text: 'Conecte o Mercado Livre primeiro na página Integrações.' });
              } else if (res.status === 401) {
                  setSyncStatus({ type: 'error', text: 'Token expirado. Reconecte o Mercado Livre.' });
              } else {
                  setSyncStatus({ type: 'error', text: data.error || 'Erro ao sincronizar produtos.' });
              }
          } else {
              setSyncStatus({ type: 'success', text: `${data.count} produtos sincronizados com sucesso!` });
              await loadProducts();
          }
      } catch (e: any) {
          setSyncStatus({ type: 'error', text: 'Erro de conexão ao tentar sincronizar.' });
      }
      setSyncing(false);
  };

  const saveLink = async (productId: string) => {
      try {
          const { serverTimestamp } = await import('firebase/firestore');
          // For future, maybe map this back to mercadolivre_products in firestore
          await updateDoc(doc(db, 'mercadolivre_products', productId), {
              product_affiliate_link: tempLink,
              updated_at: serverTimestamp()
          });
          setEditingLink(null);
          await loadProducts();
      } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, 'mercadolivre_products');
          alert('Erro ao salvar link de afiliado');
      }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[20px] font-bold text-primary flex items-center gap-2"><Package className="w-5 h-5"/> Produtos ML</h1>
            <p className="text-[13px] text-secondary mt-1">Sincronize e gerencie seus produtos do Mercado Livre.</p>
          </div>
          <button 
            onClick={handleSync}
            disabled={syncing || loading}
            className="bg-[#ffe600] text-[#2d3277] hover:opacity-90 transition-opacity px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-[13px] shadow-sm disabled:opacity-50"
          >
            {syncing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sincronizando produtos...</>
            ) : (
                <><RefreshCw className="w-4 h-4" /> Sincronizar produtos do Mercado Livre</>
            )}
          </button>
      </div>
      
      {syncStatus && (
          <div className={`mb-6 p-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 ${syncStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              <AlertCircle className="w-4 h-4" />
              {syncStatus.text}
              {syncStatus.text.includes('Integrações') && (
                  <button onClick={() => navigate('/dashboard/integrations')} className="ml-auto underline font-bold">
                      Ir para Integrações
                  </button>
              )}
          </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
      ) : products.length === 0 ? (
        <div className="bg-primary border border-subtle rounded-xl p-8 text-center text-secondary">
           Nenhum produto sincronizado ainda. Clique em "Sincronizar produtos do Mercado Livre" acima.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map(p => (
                <div key={p.id} className="bg-primary border border-subtle rounded-xl overflow-hidden shadow-sm hover:shadow transition-shadow flex flex-col">
                    <div className="bg-secondary/20 h-[200px] flex items-center justify-center border-b border-subtle p-4 relative">
                        {p.thumbnail ? (
                            <img src={p.thumbnail.replace('-I.jpg', '-O.jpg')} alt={p.title} className="w-full h-full object-contain mix-blend-multiply" />
                        ) : (
                            <Package className="w-10 h-10 text-subtle" />
                        )}
                        <div className="absolute top-3 right-3 flex flex-col gap-1">
                            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md text-white ${p.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`}>
                                {p.status === 'active' ? 'Ativo' : p.status}
                            </span>
                        </div>
                    </div>
                    
                    <div className="p-4 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2 gap-2">
                             <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-primary line-clamp-2 hover:text-accent-blue transition-colors relative z-10 block mb-1">
                                {p.title}
                             </a>
                        </div>
                        
                        <div className="flex items-end gap-2 mb-4">
                            <span className="text-[18px] font-bold text-black leading-none pb-1">
                                R$ {Number(p.price).toFixed(2).replace('.', ',')}
                            </span>
                            {p.original_price && p.original_price > p.price && (
                                <span className="text-[12px] text-secondary line-through mb-1">
                                    R$ {Number(p.original_price).toFixed(2).replace('.', ',')}
                                </span>
                            )}
                            <span className="text-[11px] text-secondary mb-1 ml-auto">
                                Estoque: {p.available_quantity || 0}
                            </span>
                        </div>

                        <div className="mt-auto pt-4 border-t border-subtle/50">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-2 flex items-center gap-1">
                                <LinkIcon className="w-3 h-3" /> Link de Afiliado
                            </label>
                            
                            {editingLink === p.id ? (
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="url" 
                                        value={tempLink} 
                                        onChange={e => setTempLink(e.target.value)}
                                        className="flex-1 p-2 bg-secondary border border-subtle rounded-md text-[12px] focus:outline-none focus:border-accent-blue"
                                        placeholder="Cole aqui o link encurtado"
                                        autoFocus
                                    />
                                    <button 
                                        onClick={() => saveLink(p.id)}
                                        className="bg-accent-blue text-white px-3 py-2 rounded-md text-[12px] font-semibold hover:opacity-90"
                                    >
                                        Salvar
                                    </button>
                                </div>
                            ) : (
                                <div 
                                  className="w-full p-2 bg-secondary/50 border border-transparent rounded-md text-[12px] text-primary truncate hover:border-subtle cursor-pointer transition-colors"
                                  onClick={() => {
                                      setEditingLink(p.id);
                                      setTempLink(p.product_affiliate_link || '');
                                  }}
                                >
                                    {p.product_affiliate_link || <span className="text-secondary/50 italic">Nenhum link afiliado (Clique para adicionar)</span>}
                                </div>
                            )}
                            
                            <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="block text-center mt-3 text-[12px] text-[#2d3277] font-semibold hover:underline">
                                Ver no Mercado Livre
                            </a>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
}
