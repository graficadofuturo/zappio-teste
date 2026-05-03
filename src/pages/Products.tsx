import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { updateDoc, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';
import { Loader2, Package, Link as LinkIcon, RefreshCw, AlertCircle, Search, PlusCircle, CheckCircle2, Wand2, Info, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    setSyncStatus(null);
    try {
      const response = await fetch(`/api/offers?marketplace=Mercado Livre&status=active`);
      const data = await response.json();
      
      if (response.ok && data.ok) {
          setProducts(data.offers || []);
      } else {
          console.error(data.error);
      }
    } catch (e) {
        console.error("Failed to load offers:", e);
    }
    setLoading(false);
  };

  const handleSyncDaily = async () => {
      setSyncing(true);
      setSyncStatus(null);
      try {
          const res = await fetch('/api/offers/mercadolivre/sync-daily', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
          });
          
          const data = await res.json();
          
          if (!res.ok || !data.ok) {
              setSyncStatus({ type: 'error', text: data.error || 'Erro ao sincronizar ofertas do dia.' });
          } else {
              setSyncStatus({ type: 'success', text: data.message });
              await loadProducts();
          }
      } catch (e: any) {
          setSyncStatus({ type: 'error', text: 'Erro de conexão ao tentar coletar ofertas.' });
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

  const renderProductCard = (p: any) => {
      const title = p.product_name;
      const image = p.product_image;
      const price = p.product_price;
      const oldPrice = p.product_old_price;
      const discount = p.product_discount;
      const link = p.product_original_link;
      const affiliateLink = p.product_affiliate_link;
      const category = p.category || "Geral";

      return (
        <div key={p.id} className="bg-white flex flex-col border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 group">
            <div className="bg-white h-[200px] flex items-center justify-center border-b border-gray-100 p-4 relative group-hover:bg-gray-50 transition-colors">
                <div className="absolute top-3 left-3 z-10">
                    <span className="px-2 py-1 bg-white/90 backdrop-blur-sm border border-gray-100 rounded-md text-[10px] font-bold text-gray-500 uppercase shadow-sm">
                        {category}
                    </span>
                </div>
                {image ? (
                    <img src={image} alt={title} className="w-full h-full object-contain mix-blend-multiply drop-shadow-sm" />
                ) : (
                    <Package className="w-10 h-10 text-gray-300" />
                )}
                {marketplaceLogo(p.marketplace)}
            </div>
            
            <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2 gap-2">
                     <a href={link} target="_blank" rel="noopener noreferrer" className="text-[14px] font-bold text-gray-900 line-clamp-2 hover:text-[#2d3277] transition-colors relative z-10 block mb-1 leading-snug">
                        {title}
                     </a>
                </div>
                
                <div className="flex items-end gap-2 mb-4">
                    <span className="text-[20px] font-extrabold text-gray-900 leading-none pb-0.5">
                        R$ {Number(price).toFixed(2).replace('.', ',')}
                    </span>
                    {oldPrice && oldPrice > price && (
                        <span className="text-[12px] text-gray-400 line-through mb-1">
                            R$ {Number(oldPrice).toFixed(2).replace('.', ',')}
                        </span>
                    )}
                    {discount && (
                        <span className="text-[11px] font-bold text-green-600 mb-1 ml-1 bg-green-50 px-1.5 py-0.5 rounded text-center">
                            {discount}
                        </span>
                    )}
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${affiliateLink ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                      <span className="text-[11px] font-medium text-gray-500">
                        {affiliateLink ? 'Link Afiliado Pronto' : 'Aguardando Link'}
                      </span>
                    </div>
                    
                    <button 
                        onClick={() => navigate('/campaigns', { state: { offerId: p.id } })}
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
                      <button 
                        onClick={() => handleUpdateOffer(p.id)}
                        className="p-2 bg-gray-50 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Atualizar oferta"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                </div>
            </div>
        </div>
      );
  };
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
            onClick={handleSyncDaily}
            disabled={syncing || loading}
            className="bg-[#ffe600] text-[#2d3277] hover:bg-[#f5dd00] transition-colors px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-[14px] shadow-sm disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} 
            Sincronizar Ofertas do Dia
          </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl flex items-start gap-3 shadow-sm">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
          <div className="text-[13px] leading-relaxed">
              <strong>Coleta Automática:</strong> Nosso sistema coleta as melhores ofertas do dia no Mercado Livre. 
              As ofertas são sincronizadas com preço e imagem reais. Certifique-se de configurar seu link de afiliado na campanha ou integração.
          </div>
      </div>

      {syncStatus && (
          <div className="animate-in slide-in-from-top-2 duration-300">
            <div className={`p-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 ${syncStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {syncStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {syncStatus.text}
            </div>
          </div>
      )}

      <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-gray-900 flex items-center gap-2">
                Ofertas Disponíveis
                <span className="bg-gray-100 text-gray-600 text-[12px] px-2 py-0.5 rounded-full">{products.length}</span>
              </h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Filtrar ofertas..." 
                    className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
                  />
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
               <h3 className="text-[18px] font-bold text-gray-900 mb-2">Nenhuma oferta carregada</h3>
               <p className="text-[14px] text-gray-500 max-w-sm mb-8 leading-relaxed">As ofertas sincronizadas aparecerão aqui. Clique em "Sincronizar Ofertas do Dia" para começar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products
                  .filter(p => !searchQuery || p.product_name?.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(p => renderProductCard(p))}
            </div>
          )}
      </div>
    </div>
  );
}
