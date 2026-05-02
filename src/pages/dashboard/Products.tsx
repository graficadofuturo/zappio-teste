import { useState, useEffect } from 'react';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { Loader2, Package, Link as LinkIcon, RefreshCw } from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const q = query(
            collection(db, 'products'),
            where('user_id', '==', user.uid)
        );
        const querySnapshot = await getDocs(q);
        
        // Sorting in memory to avoid needing complex composite index for now
        const items = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a: any, b: any) => {
            const timeA = a.last_synced_at?.seconds || 0;
            const timeB = b.last_synced_at?.seconds || 0;
            return timeB - timeA;
        });
        setProducts(items);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'products');
    }
    setLoading(false);
  };

  const saveLink = async (productId: string) => {
      try {
          const { serverTimestamp } = await import('firebase/firestore');
          await updateDoc(doc(db, 'products', productId), {
              product_affiliate_link: tempLink,
              updated_at: serverTimestamp()
          });
          setEditingLink(null);
          await loadProducts();
      } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, 'products');
          alert('Erro ao salvar link de afiliado');
      }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-[20px] font-bold text-primary flex items-center gap-2"><Package className="w-5 h-5"/> Produtos ML</h1>
            <p className="text-[13px] text-secondary mt-1">Gerencie os produtos importados e adicione seus links de afiliado.</p>
          </div>
          <button 
            onClick={loadProducts}
            className="text-secondary hover:text-primary transition-colors p-2"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
      ) : products.length === 0 ? (
        <div className="bg-primary border border-subtle rounded-xl p-8 text-center text-secondary">
           Nenhum produto encontrado. Acesse "Integrações" e sincronize seus produtos do Mercado Livre.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map(p => (
                <div key={p.id} className="bg-primary border border-subtle rounded-xl overflow-hidden shadow-sm hover:shadow transition-shadow flex flex-col">
                    <div className="bg-secondary/20 h-[200px] flex items-center justify-center border-b border-subtle p-4">
                        {p.product_image ? (
                            <img src={p.product_image} alt={p.product_title} className="w-full h-full object-contain mix-blend-multiply" />
                        ) : (
                            <Package className="w-10 h-10 text-subtle" />
                        )}
                    </div>
                    
                    <div className="p-4 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2 gap-2">
                             <a href={p.product_link} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-primary line-clamp-2 hover:text-accent-blue transition-colors">
                                {p.product_title}
                             </a>
                        </div>
                        
                        <div className="flex items-end gap-2 mb-4">
                            <span className="text-[18px] font-bold text-black border-b-[3px] border-[#ffe600] leading-none pb-1">
                                R$ {Number(p.product_price).toFixed(2).replace('.', ',')}
                            </span>
                            {p.product_old_price && (
                                <span className="text-[12px] text-secondary line-through mb-1">
                                    R$ {Number(p.product_old_price).toFixed(2).replace('.', ',')}
                                </span>
                            )}
                            {p.product_discount && (
                                <span className="text-[10px] font-bold text-green-600 mb-1.5 ml-1">
                                    {p.product_discount} OFF
                                </span>
                            )}
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
                        </div>
                    </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
}
