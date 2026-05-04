import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { updateDoc, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';
import { Loader2, Package, Link as LinkIcon, RefreshCw, AlertCircle, Search, PlusCircle, CheckCircle2, Wand2, Info, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { simplifyProductTitle } from '../lib/productUtils';

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMarketplace, setFilterMarketplace] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDiscount, setFilterDiscount] = useState(false);
  const [sortBy, setSortBy] = useState('recent');
  
  const [syncStatus, setSyncStatus] = useState<{type: 'success' | 'error' | 'warning', text: string} | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    setSyncStatus(null);
    try {
      const response = await fetch(`/api/offers/list?category=todos&limit=50`);
      const data = await response.json();
      
      if (response.ok && data.ok) {
          setProducts(data.offers || []);
      } else {
          console.error(data.error);
          setSyncStatus({ type: 'error', text: data.error || 'Falha ao carregar ofertas.' });
      }
    } catch (e) {
        console.error("Failed to load offers:", e);
        setSyncStatus({ type: 'error', text: 'Erro de conexão ao carregar ofertas.' });
    }
    setLoading(false);
  };

  const handleCollectorRun = async () => {
      setSyncing(true);
      setSyncStatus(null);
      try {
          const res = await fetch('/api/offers/collector/run?marketplace=mercadolivre&category=todos&limit=100');
          const data = await res.json();
          
          if (!res.ok || !data.ok) {
              setSyncStatus({ type: 'error', text: `Erro ao executar o robô: ${data.error || 'Erro desconhecido'}` });
          } else {
              if (data.apiSearchBlocked && data.totalSaved > 0) {
                setSyncStatus({ 
                  type: 'warning', 
                  text: `API bloqueada, mas o robô coletou ${data.totalSaved} ofertas via fallback HTML.` 
                });
              } else if (data.totalSaved === 0 && data.apiSearchBlocked) {
                setSyncStatus({ 
                  type: 'error', 
                  text: 'API bloqueada e fallback falhou. O robô não conseguiu coletar ofertas agora.' 
                });
              } else {
                setSyncStatus({ type: 'success', text: `O robô coletou ${data.totalSaved || 0} novas ofertas com sucesso!` });
              }
              await loadProducts();
          }
      } catch (e: any) {
          setSyncStatus({ type: 'error', text: `Erro ao executar robô: ${e.message || 'Erro de conexão'}` });
      }
      setSyncing(false);
  };

  const handleUpdateOffer = async (id: string) => {
     loadProducts();
  };

  const marketplaceLogo = (mp: string) => {
    if (mp === "Mercado Livre") {
      return (
        <div className="absolute top-3 right-3 z-10 w-7 h-7 bg-[#ffe600] rounded-full flex items-center justify-center border border-yellow-300 shadow-md">
          <span className="text-[10px] font-black text-[#2d3277]">ML</span>
        </div>
      );
    }
    return null;
  };

  const formatCurrency = (value: any) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  };

  const renderProductCard = (p: any) => {
      const originalTitle = p.titleOriginal || p.title;
      const displayTitle = p.titleShort || p.title;
      const image = p.imageUrl || p.image || p.thumbnail;
      const price = p.price;
      const oldPrice = p.originalPrice;
      const discount = p.discountPercent ? `${p.discountPercent}% OFF` : null;
      const link = p.productUrl;
      const affiliateLink = p.affiliateUrl;
      const category = p.category || "Geral";

      const formattedPrice = formatCurrency(price);
      if (!formattedPrice) return null;

      return (
        <div key={p.id || p.productId || p.marketplaceProductId} className="bg-white flex flex-col border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 group">
            <div className="bg-white h-[200px] flex items-center justify-center border-b border-gray-100 p-4 relative group-hover:bg-gray-50 transition-colors">
                <div className="absolute top-3 left-3 z-10">
                    <span className="px-2 py-1 bg-white/90 backdrop-blur-sm border border-gray-100 rounded-md text-[10px] font-bold text-gray-500 uppercase shadow-sm capitalize inline-block truncate max-w-[150px]">
                        {category.replace('_', ' e ')}
                    </span>
                </div>
                <img src={image} alt={displayTitle} className="w-full h-full object-contain mix-blend-multiply drop-shadow-sm" />
                {marketplaceLogo("Mercado Livre")}
            </div>
            
            <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2 gap-2 h-[2.5rem]">
                     <a 
                        href={link} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[14px] font-bold text-gray-900 line-clamp-2 hover:text-[#2d3277] transition-colors relative z-10 block mb-1 leading-snug"
                        title={originalTitle}
                      >
                        {displayTitle}
                     </a>
                </div>
                
                <div className="flex items-end gap-2 mb-4">
                    <span className="text-[20px] font-extrabold text-gray-900 leading-none pb-0.5">
                        {formattedPrice}
                    </span>
                    {Number(oldPrice) > 0 && Number(oldPrice) > Number(price) && (
                        <span className="text-[12px] text-gray-400 line-through mb-1">
                            {formatCurrency(oldPrice)}
                        </span>
                    )}
                    {Boolean(discount) && (
                        <span className="text-[11px] font-bold text-green-600 mb-1 ml-1 bg-green-50 px-1.5 py-0.5 rounded text-center">
                            {discount}
                        </span>
                    )}
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${affiliateLink ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                      <span className="text-[11px] font-medium text-gray-500">
                        {affiliateLink ? 'Link Afiliado Pronto' : 'Link Original Disponível'}
                      </span>
                    </div>
                    
                    <button 
                        onClick={() => navigate('/campaigns', { state: { offerId: p.productId || p.marketplaceProductId, type: 'auto_offer', marketplace: 'mercadolivre' } })}
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-sm"
                    >
                        <Sparkles className="w-4 h-4"/> Usar em campanha
                    </button>
                    
                    <div className="flex gap-2">
                      <a 
                        href={link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex-1 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-[12px] font-bold text-center hover:bg-gray-100 transition-colors"
                      >
                        Ver produto
                      </a>
                    </div>
                </div>
            </div>
        </div>
      );
  };
  const filteredProducts = products.filter(p => {
    // Front-end strict filter
    if (!p || !p.title || !p.productUrl || p.title === "Produto Mercado Livre") return false;
    const pPrice = Number(p.price);
    if (!Number.isFinite(pPrice) || pPrice <= 0) return false;

    if (searchQuery && !p.title?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterMarketplace && p.marketplace !== filterMarketplace) return false;
    if (filterCategory && p.category !== filterCategory) return false;
    if (filterDiscount && (!p.discountPercent || parseInt(p.discountPercent) <= 0)) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'discount') {
      return (parseInt(b.discountPercent) || 0) - (parseInt(a.discountPercent) || 0);
    }
    if (sortBy === 'price_asc') {
      return (Number(a.price) || 0) - (Number(b.price) || 0);
    }
    // recent
    const timeA = new Date(a.collectedAt || a.updatedAt || 0).getTime();
    const timeB = new Date(b.collectedAt || b.updatedAt || 0).getTime();
    return timeB - timeA;
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-6 h-6 text-indigo-600"/> Banco de Ofertas
            </h1>
            <p className="text-[14px] text-gray-500 mt-1">Produtos reais coletados do Mercado Livre para suas automações.</p>
          </div>
          <button 
            onClick={handleCollectorRun}
            disabled={syncing || loading}
            className="bg-indigo-600 text-white hover:bg-indigo-700 transition-colors px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-[14px] shadow-sm disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} 
            Executar coleta agora
          </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl flex items-start gap-3 shadow-sm">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
          <div className="text-[13px] leading-relaxed">
              <strong>Zappio Offer Collector:</strong> Nosso robô central coleta automaticamente as melhores ofertas do dia. 
              O Banco de Ofertas é alimentado sem que você precise fazer nada.
          </div>
      </div>

      {syncStatus && (
          <div className="animate-in slide-in-from-top-2 duration-300">
            <div className={`p-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 ${
              syncStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 
              syncStatus.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
              'bg-red-50 border-red-200 text-red-700'
            }`}>
                {syncStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
                 syncStatus.type === 'warning' ? <AlertCircle className="w-4 h-4" /> :
                 <AlertCircle className="w-4 h-4" />}
                {syncStatus.text}
            </div>
          </div>
      )}

      <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                  <h2 className="text-[18px] font-bold text-gray-900 flex items-center gap-2">
                    Ofertas Disponíveis
                    <span className="bg-gray-100 text-gray-600 text-[12px] px-2 py-0.5 rounded-full">{filteredProducts.length}</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nome..." 
                        className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
                      />
                    </div>
                  </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <select 
                    value={filterMarketplace} 
                    onChange={e => setFilterMarketplace(e.target.value)}
                    className="p-2 border border-gray-200 rounded-lg text-[12px] bg-white text-gray-700 outline-none"
                  >
                    <option value="">Todos Marketplaces</option>
                    <option value="mercadolivre">Mercado Livre</option>
                  </select>
                  
                    <select 
                      value={filterCategory} 
                      onChange={e => setFilterCategory(e.target.value)}
                      className="p-2 border border-gray-200 rounded-lg text-[12px] bg-white text-gray-700 outline-none"
                    >
                      <option value="">Todas Categorias</option>
                      {["Tecnologia", "Casa e Cozinha", "Beleza e Saúde", "Moda", "Ferramentas", "Automotivo", "Brinquedos", "Esporte e Fitness", "Geral"].map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  
                  <label className="flex items-center gap-2 text-[12px] text-gray-700 font-medium cursor-pointer bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition">
                    <input 
                      type="checkbox" 
                      checked={filterDiscount} 
                      onChange={e => setFilterDiscount(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Somente com desconto
                  </label>
                  
                  <div className="ml-auto">
                    <select 
                      value={sortBy} 
                      onChange={e => setSortBy(e.target.value)}
                      className="p-2 border border-gray-200 rounded-lg text-[12px] font-medium bg-white text-gray-900 outline-none"
                    >
                      <option value="recent">Mais Recentes</option>
                      <option value="discount">Maior Desconto</option>
                      <option value="price_asc">Menor Preço</option>
                    </select>
                  </div>
              </div>
          </div>

          {loading ? (
            <div className="py-24 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : products.length === 0 ? (
            <div className="bg-white flex flex-col items-center justify-center border border-gray-200 rounded-3xl py-24 text-center shadow-sm">
               <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mb-5">
                 <Package className="w-8 h-8 text-gray-400" />
               </div>
               <h3 className="text-[18px] font-bold text-gray-900 mb-2">O Banco de Ofertas ainda está vazio.</h3>
               <p className="text-[14px] text-gray-500 max-w-sm mb-8 leading-relaxed">O robô de ofertas ainda não coletou produtos ou você pode executar a coleta agora.</p>
               <button 
                 onClick={handleCollectorRun}
                 disabled={syncing || loading}
                 className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-[13px] hover:bg-indigo-700 transition-all flex items-center gap-2"
               >
                 {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                 Executar coleta agora
               </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white flex flex-col items-center justify-center border border-gray-200 rounded-3xl py-24 text-center shadow-sm">
               <h3 className="text-[18px] font-bold text-gray-900 mb-2">Nenhuma oferta bate com os filtros</h3>
               <button onClick={() => { setSearchQuery(''); setFilterMarketplace(''); setFilterCategory(''); setFilterDiscount(false); }} className="text-indigo-600 hover:underline text-[13px] font-medium">Limpar filtros</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProducts.map(p => renderProductCard(p))}
            </div>
          )}
      </div>
    </div>
  );
}
