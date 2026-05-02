import { useState, useEffect } from 'react';
import { auth, db } from '../../lib/firebase';
import { updateDoc, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { Loader2, Package, Link as LinkIcon, RefreshCw, AlertCircle, Search, PlusCircle, CheckCircle2, Wand2, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');
  
  const [mode, setMode] = useState<'library' | 'search'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingIds, setAddingIds] = useState<Record<string, boolean>>({});

  const [syncStatus, setSyncStatus] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === 'library') loadProducts();
  }, [mode]);

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
                  setSyncStatus({ type: 'error', text: 'Conecte o Mercado Livre primeiro na página Integrações para usar a busca por vendedor.' });
              } else if (res.status === 401) {
                  setSyncStatus({ type: 'error', text: 'Token expirado. Reconecte o Mercado Livre.' });
              } else {
                  setSyncStatus({ type: 'error', text: data.error || 'Erro ao sincronizar produtos.' });
              }
          } else {
              setSyncStatus({ type: 'success', text: `${data.count} produtos sincronizados (da sua loja) com sucesso!` });
              if (mode === 'library') await loadProducts();
              else setMode('library'); // switch mode
          }
      } catch (e: any) {
          setSyncStatus({ type: 'error', text: 'Erro de conexão ao tentar sincronizar.' });
      }
      setSyncing(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      
      setSearching(true);
      setSearchResults([]);
      setSearchError(null);
      try {
          const res = await fetch(`/api/mercadolivre/affiliate-products/search?q=${encodeURIComponent(searchQuery)}`);
          const data = await res.json();
          if (res.ok && data.ok) {
              setSearchResults(data.products || []);
          } else {
              if (res.status === 403) {
                  setSearchError("Busca bloqueada pelo servidor. Verifique a rota de busca pública.");
              } else {
                  setSearchError(data.error || "Erro ao buscar");
              }
          }
      } catch (err) {
          console.error(err);
          setSearchError("Erro de conexão ao tentar buscar.");
      }
      setSearching(false);
  };

  const handleAddProduct = async (product: any) => {
      try {
          const user = auth.currentUser;
          if (!user) return alert("Você precisa estar logado!");
          
          setAddingIds(prev => ({ ...prev, [product.product_id]: true }));
          const res = await fetch('/api/mercadolivre/products/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.uid, product })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
              alert('Erro ao salvar produto: ' + data.error);
          }
      } catch (err) {
          console.error(err);
          alert('Erro de conexão ao tentar salvar o produto.');
      }
      setAddingIds(prev => ({ ...prev, [product.product_id]: false }));
  };

  const saveLink = async (productId: string) => {
      try {
          const { serverTimestamp } = await import('firebase/firestore');
          await updateDoc(doc(db, 'affiliate_products', productId), {
              product_affiliate_link: tempLink,
              updated_at: serverTimestamp()
          });
          setEditingLink(null);
          await loadProducts();
      } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, 'affiliate_products');
          alert('Erro ao salvar link de afiliado');
      }
  };

  const renderProductCard = (p: any, isSearch: boolean = false) => {
      const added = !isSearch ? true : products.some(saved => String(saved.product_id) === String(p.product_id));
      const isLoadingAdd = addingIds[p.product_id];
      
      const title = p.title || p.product_title;
      const image = p.image || p.product_image;
      const price = p.price !== undefined ? p.price : p.product_price;
      const oldPrice = p.old_price !== undefined ? p.old_price : p.product_old_price;
      const discount = p.discount || p.product_discount;
      const link = p.product_link;

      return (
        <div key={p.product_id || p.id} className="bg-primary flex flex-col border border-subtle rounded-xl overflow-hidden shadow-sm hover:shadow transition-shadow">
            <div className="bg-secondary/20 h-[200px] flex items-center justify-center border-b border-subtle p-4 relative">
                {image ? (
                    <img src={image} alt={title} className="w-full h-full object-contain mix-blend-multiply" />
                ) : (
                    <Package className="w-10 h-10 text-subtle" />
                )}
            </div>
            
            <div className="p-4 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2 gap-2">
                     <a href={link} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-primary line-clamp-2 hover:text-accent-blue transition-colors relative z-10 block mb-1">
                        {title}
                     </a>
                </div>
                
                <div className="flex items-end gap-2 mb-4">
                    <span className="text-[18px] font-bold text-black leading-none pb-1">
                        R$ {Number(price).toFixed(2).replace('.', ',')}
                    </span>
                    {oldPrice && oldPrice > price && (
                        <span className="text-[12px] text-secondary line-through mb-1">
                            R$ {Number(oldPrice).toFixed(2).replace('.', ',')}
                        </span>
                    )}
                    {discount && (
                        <span className="text-[10px] font-bold text-green-600 mb-1.5 ml-1">
                            {discount} {String(discount).includes('OFF') ? '' : 'OFF'}
                        </span>
                    )}
                </div>

                <div className="mt-auto pt-4 border-t border-subtle/50 space-y-3">
                    {isSearch ? (
                        <button 
                            onClick={() => handleAddProduct(p)}
                            disabled={added || isLoadingAdd}
                            className={`w-full py-2 rounded-lg font-bold text-[13px] flex items-center justify-center gap-2 transition-all ${
                                added 
                                ? 'bg-green-50 text-green-700 border border-green-200' 
                                : 'bg-[#ffe600] text-[#2d3277] hover:opacity-90'
                            }`}
                        >
                            {isLoadingAdd ? <Loader2 className="w-4 h-4 animate-spin" /> : added ? <CheckCircle2 className="w-4 h-4"/> : <PlusCircle className="w-4 h-4"/>}
                            {added ? 'Já adicionado' : 'Adicionar à Biblioteca'}
                        </button>
                    ) : (
                        <>
                            <div>
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
                            </div>
                            
                            <div className="pt-2 border-t border-subtle/30 flex justify-between items-center text-[12px] font-semibold">
                                <a href={link} target="_blank" rel="noopener noreferrer" className="text-[#2d3277] hover:underline flex-1 text-center">
                                    Ver no Mercado Livre
                                </a>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
      );
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      
      <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[24px] font-bold text-primary flex items-center gap-2">
                <Package className="w-6 h-6"/> Produtos Afiliados
            </h1>
            <p className="text-[14px] text-secondary mt-1">Busque produtos no ML ou sincronize sua loja para gerar campanhas.</p>
          </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-[13px] leading-relaxed">
              <strong>Modo de Afiliado:</strong> Por segurança, a geração automática de links afiliados depende de suporte oficial ou integração validada pela sua conta de parceiro. No momento, busque o produto, adicione à biblioteca e <strong>cole seu link afiliado manualmente</strong> gerado no Portal de Afiliados do Mercado Livre. 
          </div>
      </div>

      <div className="flex gap-1 bg-secondary/20 p-1 rounded-xl w-max">
          <button 
             onClick={() => setMode('library')}
             className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${mode === 'library' ? 'bg-primary shadow-sm text-[#2d3277]' : 'text-secondary hover:text-primary'}`}
          >
              Minha Biblioteca
          </button>
          <button 
             onClick={() => setMode('search')}
             className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${mode === 'search' ? 'bg-primary shadow-sm text-[#2d3277]' : 'text-secondary hover:text-primary'}`}
          >
              Buscar no Mercado Livre
          </button>
      </div>
      
      {syncStatus && (
          <div className={`p-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 ${syncStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              <AlertCircle className="w-4 h-4" />
              {syncStatus.text}
              {syncStatus.text.includes('Integrações') && (
                  <button onClick={() => navigate('/dashboard/integrations')} className="ml-auto underline font-bold">
                      Ir para Integrações
                  </button>
              )}
          </div>
      )}

      {mode === 'library' && (
          <div className="space-y-6">
              <div className="flex justify-between items-center">
                  <h2 className="text-[16px] font-bold text-primary">Meus Produtos Adicionados</h2>
                  <div className="flex gap-2">
                      <button 
                        disabled
                        className="bg-accent-blue/10 text-accent-blue opacity-50 cursor-not-allowed px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-[13px] shadow-sm"
                      >
                        <Wand2 className="w-4 h-4" /> Automação de Links (Em breve)
                      </button>
                      <button 
                        onClick={handleSync}
                        disabled={syncing || loading}
                        className="bg-secondary text-primary hover:bg-subtle transition-colors px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-[13px] shadow-sm disabled:opacity-50"
                        title="Sincroniza todos os produtos da sua loja / conta logada no ML"
                      >
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} 
                        Sync da Loja OAuth
                      </button>
                  </div>
              </div>

              {loading ? (
                <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
              ) : products.length === 0 ? (
                <div className="bg-primary flex flex-col items-center justify-center border border-subtle rounded-xl py-16 text-center">
                   <Package className="w-12 h-12 text-subtle mb-4" />
                   <h3 className="text-[16px] font-bold text-primary mb-2">Nenhum produto salvo</h3>
                   <p className="text-[14px] text-secondary max-w-sm mb-6">Você ainda não adicionou nenhum produto à sua biblioteca.</p>
                   <button 
                     onClick={() => setMode('search')}
                     className="bg-[#ffe600] text-[#2d3277] px-6 py-2.5 rounded-lg font-bold shadow-sm hover:opacity-90"
                   >
                       Buscar produtos
                   </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map(p => renderProductCard(p, false))}
                </div>
              )}
          </div>
      )}

      {mode === 'search' && (
          <div className="space-y-6">
              <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                      <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                      <input 
                          type="text" 
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Buscar no catálogo do Mercado Livre... (ex: iPhone, Geladeira, Livro)"
                          className="w-full bg-primary border border-subtle rounded-xl pl-10 pr-4 py-3 text-[14px] focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                      />
                  </div>
                  <button 
                      type="submit"
                      disabled={searching || !searchQuery.trim()}
                      className="bg-[#ffe600] text-[#2d3277] px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all min-w-[120px]"
                  >
                      {searching ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Buscar'}
                  </button>
              </form>

              {searchError && (
                  <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[13px] font-medium mb-6">
                      {searchError}
                  </div>
              )}

              {searching ? (
                  <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
              ) : searchResults.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {searchResults.map(p => renderProductCard(p, true))}
                  </div>
              ) : (
                  searchQuery && !searching && (
                      <div className="bg-primary/50 border border-subtle border-dashed rounded-xl py-12 text-center text-secondary">
                         Nenhum resultado encontrado para "{searchQuery}".
                      </div>
                  )
              )}
          </div>
      )}
    </div>
  );
}

