import { useState, useEffect } from 'react';
import { auth, db, GLOBAL_USER_ID } from '../lib/firebase.js';
import { updateDoc, doc, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils.js';
import { Loader2, Package, Link as LinkIcon, RefreshCw, AlertCircle, Search, PlusCircle, CheckCircle2, Wand2, Info, Sparkles, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { simplifyProductTitle } from '../lib/productUtils.js';
import { fetchJson } from '../utils/apiUtils.js';

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | false>(false);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [tempLink, setTempLink] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMarketplace, setFilterMarketplace] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDiscount, setFilterDiscount] = useState(false);
  const [sortBy, setSortBy] = useState('recent');

  const [syncStatus, setSyncStatus] = useState<{type: 'success' | 'error' | 'warning', text: string} | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const navigate = useNavigate();

  const [convertingOfferId, setConvertingOfferId] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    setSyncStatus(null);
    try {
      const data = await fetchJson(`/api/offers?action=list&category=todos&limit=100&uid=${GLOBAL_USER_ID}`);
      if (data.ok) {
          setProducts(Array.isArray(data.offers) ? data.offers : []);
      }
    } catch (e: any) {
        console.error("Failed to load offers:", e);
        setSyncStatus({ type: 'error', text: e.message || 'Erro de conexão ao carregar ofertas.' });
    }
    setLoading(false);
  };

  const handleReprocess = async () => {
    setSyncing('reprocess');
    setSyncStatus(null);
    try {
      const data = await fetchJson(`/api/offers?action=reprocess&uid=${GLOBAL_USER_ID}`, { method: 'POST' });
      if (data.ok) {
        setSyncStatus({
          type: 'success',
          text: `Reprocessamento concluído! ${data.updated || 0} ofertas atualizadas.`
        });
        await loadProducts();
      }
    } catch (e: any) {
      setSyncStatus({ type: 'error', text: `Erro no reprocessamento: ${e.message}` });
    }
    setSyncing(false);
  };

  const handleCollectorRun = async () => {
      setSyncing('collect');
      setSyncStatus(null);
      try {
          const data = await fetchJson(`/api/offers?action=collect&marketplace=mercadolivre&category=todos&term=ofertas&uid=${GLOBAL_USER_ID}`, {
            method: 'POST'
          });

          if (data.ok) {
              setSyncStatus({ type: 'success', text: `O robô coletou ${data.totalSaved || 0} novas ofertas com sucesso!` });
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

  // -- SAFETY HELPERS --
  const toNumberSafe = (value: any): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 0 ? value : null;
    }
    if (typeof value === "string") {
      let normalized = value.replace(/[^\d,.-]/g, "");
      if (normalized.includes(",") && normalized.includes(".")) {
        normalized = normalized.replace(/\./g, "").replace(",", ".");
      } else if (normalized.includes(",")) {
        normalized = normalized.replace(",", ".");
      }
      const parsed = Number(normalized);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  };

  const formatBRL = (value: any) => {
    const number = toNumberSafe(value);
    if (number === null) return "Preço indisponível";
    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const hasValidDiscount = (p: any) => p.hasDiscount === true;

  const getDiscountPercentageSafe = (p: any) => toNumberSafe(p.discountPercent) || 0;

  const getOfferTitle = (p: any) => {
    return String(p?.titleShort || p?.title || "Produto sem título");
  };

  const getOfferImage = (p: any) => {
    return p?.imageUrl || p?.image || p?.thumbnail || "";
  };

  const normalizeProductUrlFrontend = (url: string) => {
    if (!url) return "";
    if (url.includes("/sec/") || url.includes("/social/")) return url;
    
    // Normalize mercadolivre URLs containing MLB- to product. subdomain
    if (url.includes("www.mercadolivre.com.br/MLB-")) {
      return url.replace("www.mercadolivre.com.br", "produto.mercadolivre.com.br");
    }
    if (url.includes("mercadolivre.com.br/MLB-") && !url.includes("www.") && !url.includes("produto.")) {
      return url.replace("mercadolivre.com.br", "produto.mercadolivre.com.br");
    }
    return url;
  };

  const getOfferUrl = (p: any) => {
    const rawUrl = p?.affiliateUrl || p?.productUrl || p?.product_link || p?.link || "";
    return normalizeProductUrlFrontend(rawUrl);
  };

  const matchCategory = (prodCat: string, filterCat: string) => {
    const pc = String(prodCat || "").toLowerCase().trim();
    const fc = String(filterCat || "").toLowerCase().trim();
    if (!fc) return true;
    if (pc === fc) return true;
    
    // V1 to V2 Category mappings
    if (fc === 'eletrônicos' && (pc === 'tecnologia' || pc === 'eletronicos')) return true;
    if (fc === 'moda e acessórios' && (pc === 'moda' || pc === 'moda e acessorios')) return true;
    if (fc === 'smartphones' && (pc === 'celular' || pc === 'celulares')) return true;
    
    return false;
  };

  const filteredProducts = (Array.isArray(products) ? products : []).filter(p => {
    if (!p) return false;
    const title = getOfferTitle(p);
    const link = getOfferUrl(p);
    if (!title || !link || title === "Produto Mercado Livre") return false;

    const pPrice = toNumberSafe(p.price);
    if (pPrice === null) return false;

    if (searchQuery) {
      const query = String(searchQuery).toLowerCase();
      const matchDisplay = title.toLowerCase().includes(query);
      const matchOriginal = p.titleOriginal && String(p.titleOriginal).toLowerCase().includes(query);
      const matchTitle = p.title && String(p.title).toLowerCase().includes(query);
      if (!matchDisplay && !matchOriginal && !matchTitle) return false;
    }
    if (filterMarketplace && String(p.marketplace || "").toLowerCase() !== String(filterMarketplace).toLowerCase()) return false;
    if (filterCategory && !matchCategory(p.category, filterCategory)) return false;

    if (filterDiscount) {
      const discounted = hasValidDiscount(p);
      if (!discounted) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'discount') {
      const discA = getDiscountPercentageSafe(a) || 0;
      const discB = getDiscountPercentageSafe(b) || 0;
      return discB - discA;
    }
    if (sortBy === 'price_asc') {
      const priceA = toNumberSafe(a.price) || 0;
      const priceB = toNumberSafe(b.price) || 0;
      return priceA - priceB;
    }
    // recent
    const timeA = new Date(a.collectedAt || a.updatedAt || 0).getTime() || 0;
    const timeB = new Date(b.collectedAt || b.updatedAt || 0).getTime() || 0;
    return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
  });

  console.log("OFFERS_PAGE_DEBUG", {
    offersIsArray: Array.isArray(products),
    offersCount: Array.isArray(products) ? products.length : 0,
    filteredCount: filteredProducts.length,
    firstOffer: filteredProducts.length > 0 ? filteredProducts[0] : null
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title">Banco de Ofertas</h1>
            <p className="page-subtitle">
              {products.length > 0
                ? `${filteredProducts.length} produtos disponíveis`
                : 'Colete produtos automaticamente do Mercado Livre'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              className="btn btn-danger btn-sm" 
              onClick={async () => {
                if (confirm("Tem certeza que deseja apagar TODOS os produtos do banco de ofertas? Isso removerá as ofertas antigas corrompidas.")) {
                  setLoading(true);
                  try {
                    const snap = await getDocs(collection(db, 'offer_bank'));
                    const batch = writeBatch(db);
                    snap.forEach(d => {
                      batch.delete(doc(db, 'offer_bank', d.id));
                    });
                    await batch.commit();
                    setProducts([]);
                    setSyncStatus({ type: 'success', text: "Banco de ofertas limpo com sucesso!" });
                  } catch (err: any) {
                    setSyncStatus({ type: 'error', text: "Erro ao limpar banco: " + err.message });
                  }
                  setLoading(false);
                }
              }}
              disabled={syncing !== false || loading}
            >
              Limpar Banco
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleReprocess} disabled={syncing === 'reprocess'}>
              {syncing === 'reprocess' ? <><span className="spinner" /> Reprocessando...</> : <>Reprocessar</>}
            </button>
            <button className="btn btn-primary" onClick={handleCollectorRun} disabled={syncing === 'collect'}>
              {syncing === 'collect' ? <><span className="spinner" /> Coletando...</> : <>Coletar Ofertas</>}
            </button>
          </div>
        </div>
      </div>

      {/* Sync status toast */}
      {syncStatus && (
        <div className={`toast ${syncStatus.type === 'success' ? 'toast-success' : 'toast-error'}`} style={{ marginBottom: 16 }}>
          {syncStatus.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {syncStatus.text}
        </div>
      )}

      {/* Filters Bar */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 24,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="Buscar produto..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="form-input"
          style={{ flex: 1, minWidth: 200, maxWidth: 320 }}
        />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="form-input form-select" style={{ width: 180 }}>
          <option value="">Todas categorias</option>
          {['Smartphones', 'Eletrônicos', 'Moda e Acessórios', 'Geral'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="form-input form-select" style={{ width: 180 }}>
          <option value="recent">Mais recentes</option>
          <option value="discount">Maior desconto</option>
          <option value="price_asc">Menor preço</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={filterDiscount}
            onChange={e => setFilterDiscount(e.target.checked)}
            style={{ accentColor: 'var(--green)', width: 15, height: 15 }}
          />
          Com desconto
        </label>
      </div>

      {/* Loading State */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden' }}>
              <div className="skeleton" style={{ height: 180 }} />
              <div style={{ padding: 16 }}>
                <div className="skeleton" style={{ height: 14, marginBottom: 8, borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 12, borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 24, width: '50%', borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ fontSize: 32 }}>🛒</div>
          <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
            Nenhum produto encontrado
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400 }}>
            {searchQuery || filterCategory || filterDiscount
              ? 'Tente ajustar os filtros para ver mais produtos.'
              : 'Clique em "Coletar Ofertas" para buscar produtos do Mercado Livre automaticamente.'}
          </p>
          {!searchQuery && !filterCategory && !filterDiscount && (
            <button
              className="btn btn-primary"
              onClick={handleCollectorRun}
              style={{ marginTop: 20 }}
              disabled={syncing === 'collect'}
            >
              {syncing === 'collect' ? <><span className="spinner" /> Coletando...</> : <>Coletar Ofertas Agora</>}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {filteredProducts.map((product: any) => {
            const hasDiscount = product.hasDiscount === true && product.discountPercent;
            const oldPrice = toNumberSafe(hasDiscount ? (product.originalPrice) : null);
            const currentPrice = toNumberSafe(product.price);
            const displayTitle = getOfferTitle(product);
            const image = getOfferImage(product);
            const originalLink = normalizeProductUrlFrontend(product.productUrlOriginal || product.originalProductUrl || product.productUrl || product.product_link || product.link || "");
            const link = product.userAffiliateUrl || getOfferUrl(product);

            // Debug log preserved from original
            console.log("OFFER_CARD_PRICE_DEBUG", {
              title: displayTitle,
              price: currentPrice,
              originalPrice: oldPrice,
              hasDiscount: product.hasDiscount,
            });

            return (
              <div key={product.id || product.productId || product.marketplaceProductId} className="product-card">
                {/* Product Image */}
                <div style={{
                  position: 'relative',
                  aspectRatio: '16/10',
                  background: 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16
                }}>
                  {image ? (
                    <img
                      src={image}
                      alt={displayTitle}
                      style={{ maxHeight: 130, maxWidth: '100%', objectFit: 'contain' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{ fontSize: 40, opacity: 0.3 }}>📦</div>
                  )}
                  {hasDiscount && (
                    <span className="discount-badge" style={{ position: 'absolute', top: 10, right: 10 }}>
                      -{String(product.discountPercent).replace(/%?\s*OFF/gi, '')}% OFF
                    </span>
                  )}
                  {(product.marketplace === 'mercadolivre' || product.marketplace === 'mercadolivre_global' || !product.marketplace) && (
                    <span style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      background: 'rgba(255, 230, 0, 0.15)',
                      border: '1px solid rgba(255,230,0,0.3)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--yellow)'
                    }}>ML</span>
                  )}
                  {product.isLightningDeal && (
                    <span style={{
                      position: 'absolute',
                      top: 10,
                      left: 45,
                      background: 'rgba(255, 153, 0, 0.25)',
                      border: '1px solid rgba(255, 153, 0, 0.4)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 800,
                      color: '#ffa500',
                      boxShadow: '0 0 8px rgba(255, 153, 0, 0.2)'
                    }}>⚡ RELÂMPAGO</span>
                  )}
                  {/* Floating Delete Button */}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm("Deseja realmente excluir este produto?")) {
                        try {
                          const id = product.id || product.productId || product.marketplaceProductId;
                          await deleteDoc(doc(db, 'offer_bank', id));
                          setProducts(prev => prev.filter(p => (p.id || p.productId || p.marketplaceProductId) !== id));
                        } catch (err: any) {
                          alert("Erro ao excluir: " + err.message);
                        }
                      }
                    }}
                    style={{
                      position: 'absolute',
                      bottom: 10,
                      right: 10,
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 8,
                      padding: 6,
                      color: '#f87171',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 10
                    }}
                    title="Excluir produto"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Product Info */}
                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <h4 style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {displayTitle}
                  </h4>

                  <div>
                    {oldPrice !== null && currentPrice !== null && oldPrice > currentPrice && (
                      <p className="product-price-old">{formatBRL(oldPrice)}</p>
                    )}
                    <p className="product-price-current">
                      {currentPrice !== null ? formatBRL(currentPrice) : 'Preço indisponível'}
                    </p>
                  </div>

                  {product.category && (
                    <span style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      display: 'inline-block',
                      fontWeight: 500
                    }}>{product.category}</span>
                  )}

                  {/* Affiliate link indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: product.hasUserAffiliateLink ? 'var(--green)' : 'var(--blue, #3b82f6)',
                      display: 'inline-block',
                      flexShrink: 0
                    }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {product.hasUserAffiliateLink ? 'Link afiliado ativo' : 'Usando link original'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
                    <a
                      href={originalLink || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1, fontSize: 12 }}
                    >
                      Ver produto
                    </a>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1, fontSize: 12 }}
                      onClick={() => navigate('/campaigns', {
                        state: {
                          offerId: product.id || product.productId || product.marketplaceProductId,
                          type: 'auto_offer',
                          marketplace: product.marketplace || 'mercadolivre'
                        }
                      })}
                    >
                      Usar
                    </button>
                  </div>

                  {/* Generate affiliate link button */}
                  <button
                    onClick={async () => {
                      const offerId = product.id || product.productId || product.marketplaceProductId;
                      const urlStr = getOfferUrl(product);
                      if (!offerId || !urlStr) {
                        alert("Não foi possível identificar o link ou ID do produto para conversão.");
                        return;
                      }
                      setConvertingOfferId(offerId);
                      try {
                        const res = await fetch(`/api/integrations/mercadolivre/convert-test?uid=${GLOBAL_USER_ID}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: urlStr, offerId })
                        });
                        const data = await res.json();
                        if (data.success && data.isAffiliate) {
                          setProducts(prev => prev.map(prod => {
                            if ((prod.id || prod.productId || prod.marketplaceProductId) === offerId) {
                              return { ...prod, userAffiliateUrl: data.affiliateUrl };
                            }
                            return prod;
                          }));
                        } else {
                          alert("Não foi possível gerar. Status: " + data?.rawResponse?.error);
                        }
                      } catch (err) {
                        alert("Erro ao gerar link: " + String(err));
                      } finally {
                        setConvertingOfferId(null);
                      }
                    }}
                    disabled={convertingOfferId === (product.id || product.productId || product.marketplaceProductId)}
                    className="btn btn-yellow btn-sm"
                    style={{ width: '100%', fontSize: 12 }}
                  >
                    {convertingOfferId === (product.id || product.productId || product.marketplaceProductId) ? (
                      <><span className="spinner" /> Gerando...</>
                    ) : (
                      'Gerar link afiliado'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
