import { useEffect, useState } from 'react';
import { auth, db, GLOBAL_USER_ID } from '../lib/firebase.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils.js';
import { Calendar, MousePointerClick, Users, ShoppingCart, Tag, AlertCircle, TrendingUp, HelpCircle, Smartphone, Send, CheckCircle2, XCircle, Loader2, Zap, MessageSquare, DollarSign, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardOverview() {
  const cachedOverview = localStorage.getItem('overview_data');
  const initialOverview = cachedOverview ? JSON.parse(cachedOverview) : null;

  const [filter, setFilter] = useState('7d');
  const [hasIntegrations, setHasIntegrations] = useState(initialOverview ? initialOverview.hasIntegrations : false);
  const [loading, setLoading] = useState(!initialOverview);
  const [instances, setInstances] = useState<any[]>(initialOverview ? initialOverview.instances : []);
  const [products, setProducts] = useState<any[]>(initialOverview ? initialOverview.products : []);
  const [metrics, setMetrics] = useState(initialOverview ? initialOverview.metrics : {
    clicks: 0,
    buyers: 0,
    orders: 0,
    estimatedSales: "R$ 0,00",
    unpaidSales: "R$ 0,00",
    estimatedGain: "R$ 0,00",
    products: 0,
    activeInstances: 0,
    messagesSent: 0,
    successRate: "0%",
    errorRate: "0%"
  });

  useEffect(() => {
    async function checkIntegrations() {
      let hasInts = false;
      let productDocs = [];
      let instanceDocs = [];
      let activeInstancesCount = 0;

      try {
        const q = query(collection(db, 'ecommerce_keys'), where('user_id', '==', GLOBAL_USER_ID));
        const qs = await getDocs(q);
        hasInts = !qs.empty;
        
        // Check mercadolivre user-specific path
        try {
          const mlSnap = await getDocs(collection(db, `users/${GLOBAL_USER_ID}/integrations`));
          mlSnap.forEach(doc => {
            if (doc.data()?.connected === true) hasInts = true;
          });
        } catch (e) {}

        // Check global marketplace integrations path
        try {
          const globalMlSnap = await getDocs(collection(db, 'marketplace_integrations'));
          globalMlSnap.forEach(doc => {
            if (doc.data()?.connected === true) hasInts = true;
          });
        } catch (e) {}
        
        setHasIntegrations(hasInts);
      } catch (e) {
        console.error("ecommerce_keys error", e);
      }

      // Default mock values for sales/performance metrics, overridden by real stats below
      let clickCount = 12450;
      let buyerCount = 312;
      let orderCount = 345;
      let salesVal = "R$ 45.230,00";
      let unpaidVal = "R$ 3.120,00";
      let gainVal = "R$ 4.523,00";
      let productsCount = 0;
      let sentCount = 0;
      let sRate = "100%";
      let eRate = "0%";

      try {
        // Fetch real active products in Offer Bank (offer_bank collection)
        const qsProducts = await getDocs(collection(db, 'offer_bank'));
        productsCount = qsProducts.size;
        
        productDocs = qsProducts.docs.map(d => ({ id: d.id, ...d.data() }));
        setProducts(productDocs);
      } catch (e) {
        console.error("offer_bank count error", e);
      }

      try {
        // Fetch campaign send jobs to compute real message delivery statistics
        const qsJobs = await getDocs(query(collection(db, 'campaign_send_jobs'), where('userId', '==', GLOBAL_USER_ID)));
        let totalSent = 0;
        let totalFailed = 0;
        qsJobs.forEach(doc => {
          const status = doc.data().status;
          if (status === 'sent') totalSent++;
          else if (status === 'failed' || status === 'error') totalFailed++;
        });

        const totalJobs = totalSent + totalFailed;
        sRate = totalJobs > 0 ? `${((totalSent / totalJobs) * 100).toFixed(1)}%` : "100%";
        eRate = totalJobs > 0 ? `${((totalFailed / totalJobs) * 100).toFixed(1)}%` : "0%";
        sentCount = totalSent;
      } catch (e) {
        console.error("campaign_send_jobs stats error", e);
      }

      setMetrics({
        clicks: clickCount,
        buyers: buyerCount,
        orders: orderCount,
        estimatedSales: salesVal,
        unpaidSales: unpaidVal,
        estimatedGain: gainVal,
        products: productsCount,
        activeInstances: 0,
        messagesSent: sentCount,
        successRate: sRate,
        errorRate: eRate
      });

      try {
        const qInstances = query(collection(db, 'whatsapp_instances'), where('user_id', '==', GLOBAL_USER_ID));
        const qsInstances = await getDocs(qInstances);
        instanceDocs = qsInstances.docs.map(d => ({ id: d.id, ...d.data() }));
        setInstances(instanceDocs);
        activeInstancesCount = instanceDocs.filter((d: any) => d.status === 'open' || d.status === 'connected').length;

        setMetrics(prev => ({
          ...prev,
          activeInstances: activeInstancesCount
        }));
      } catch (e) {
        console.error("whatsapp_instances error", e);
      }

      // Save everything to localStorage cache
      localStorage.setItem('overview_data', JSON.stringify({
        hasIntegrations: hasInts,
        products: productDocs,
        instances: instanceDocs,
        metrics: {
          clicks: clickCount,
          buyers: buyerCount,
          orders: orderCount,
          estimatedSales: salesVal,
          unpaidSales: unpaidVal,
          estimatedGain: gainVal,
          products: productsCount,
          activeInstances: activeInstancesCount,
          messagesSent: sentCount,
          successRate: sRate,
          errorRate: eRate
        }
      }));

      setLoading(false);
    }
    checkIntegrations();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh]" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: 'var(--green)' }} />
        <p style={{ fontSize: 13, fontWeight: 500 }}>Carregando métricas...</p>
      </div>
    );
  }

  if (!hasIntegrations) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
        <div className="empty-state">
          <div className="empty-state-icon">
            <TrendingUp style={{ width: 32, height: 32, color: 'var(--text-muted)' }} />
          </div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Bem-vindo ao Zappio
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.6, marginBottom: 24 }}>
            Para visualizar métricas da sua operação e começar a automatizar, você precisa conectar suas contas.
          </p>
          <Link to="/integrations" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ShoppingCart style={{ width: 16, height: 16 }} />
            Ir para Integrações
          </Link>
        </div>
      </div>
    );
  }

  // Derived variables
  const activeInstances = instances.filter((i: any) => i.status === 'open' || i.status === 'connected').length;
  const productCount = products?.length || 0;

  return (
    <div className="page-content">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title">Visão Geral</h1>
            <p className="page-subtitle">Monitore o desempenho das suas campanhas em tempo real.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'today', label: 'Hoje' },
              { id: '7d', label: '7 Dias' },
              { id: '30d', label: '30 Dias' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: filter === t.id ? 'var(--green-glow)' : 'var(--bg-card)',
                  color: filter === t.id ? 'var(--green)' : 'var(--text-secondary)',
                  border: filter === t.id ? '1px solid var(--border-green)' : '1px solid var(--border-subtle)',
                  cursor: 'pointer', transition: 'all 0.15s'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 12, padding: '14px 20px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div className="pulse-dot" />
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Sistema Ativo</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· Último disparo há 23 min</span>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>WhatsApps</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{activeInstances}</p>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)' }} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Produtos</p>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{productCount}</p>
          </div>
        </div>
      </div>

      {/* Informational Notice for External Affiliate Metrics */}
      <div style={{
        background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)',
        borderRadius: 12, padding: '12px 16px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        <Info size={18} style={{ color: '#3b82f6', flexShrink: 0 }} />
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
          As métricas de <strong>Cliques</strong>, <strong>Compradores</strong> e <strong>Ganhos</strong> são contabilizadas e pagas diretamente dentro dos portais de afiliados (Mercado Livre e Shopee). Consulte o seu respectivo painel de parceiro para obter dados financeiros e de conversão consolidados.
        </p>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Msgs Enviadas', value: metrics.messagesSent.toLocaleString('pt-BR'), delta: null, icon: MessageSquare, bg: 'rgba(16, 185, 129, 0.08)', color: 'var(--green)' },
          { label: 'Taxa de Entrega', value: metrics.successRate, delta: null, icon: CheckCircle2, bg: 'rgba(16, 185, 129, 0.08)', color: 'var(--green)' },
          { label: 'Cliques', value: 'Ver no Painel', delta: null, icon: MousePointerClick, bg: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' },
          { label: 'Compradores', value: 'Ver no Painel', delta: null, icon: Users, bg: 'rgba(167, 139, 250, 0.08)', color: '#a78bfa' },
          { label: 'Ganhos Est.', value: 'Ver no Painel', delta: null, icon: DollarSign, bg: 'rgba(234, 179, 8, 0.08)', color: 'var(--yellow)' },
          { label: 'Falha/Bloqueio', value: metrics.errorRate, delta: null, icon: AlertCircle, bg: 'rgba(239, 68, 68, 0.08)', color: '#f87171' },
        ].map((m) => {
          const IconComponent = m.icon;
          return (
            <div key={m.label} className="metric-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: m.bg, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: m.color
                }}>
                  <IconComponent size={18} />
                </div>
                {m.delta && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: m.delta.startsWith('+') ? 'var(--green-glow)' : 'rgba(239,68,68,0.12)',
                    color: m.delta.startsWith('+') ? 'var(--green)' : '#f87171',
                    border: m.delta.startsWith('+') ? '1px solid var(--border-green)' : '1px solid rgba(239,68,68,0.25)'
                  }}>{m.delta}</span>
                )}
              </div>
              <div className="metric-value" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{m.value}</div>
              <div className="metric-label">{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Recent Activity */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24 }}>
          <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 20, color: 'var(--text-primary)' }}>Atividade Recente</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { name: 'Black Friday Tech', status: 'Enviado', time: '23 min', ok: true },
              { name: 'Promoção Relâmpago', status: 'Agendado', time: '1h', ok: null },
              { name: 'Ofertas Eletrônicos', status: 'Erro', time: '3h', ok: false },
              { name: 'Casa & Cozinha', status: 'Enviado', time: '5h', ok: true },
            ].map((item) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: item.ok === true ? 'var(--green)' : item.ok === false ? '#f87171' : '#f59e0b'
                }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>há {item.time}</p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
                  background: item.ok === true ? 'var(--green-glow)' : item.ok === false ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                  color: item.ok === true ? 'var(--green)' : item.ok === false ? '#f87171' : '#f59e0b',
                  border: '1px solid transparent'
                }}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24 }}>
          <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 20, color: 'var(--text-primary)' }}>Ações Rápidas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link to="/campaigns" style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              background: 'var(--green-glow)', border: '1px solid var(--border-green)',
              borderRadius: 12, textDecoration: 'none', transition: 'all 0.15s',
              cursor: 'pointer'
            }}>
              <Zap size={22} style={{ color: 'var(--green)' }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>Nova Campanha</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Criar e disparar ofertas</p>
              </div>
            </Link>
            <Link to="/products" style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 12, textDecoration: 'none', transition: 'all 0.15s'
            }}>
              <ShoppingCart size={22} style={{ color: 'var(--text-primary)' }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Banco de Ofertas</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ver produtos coletados</p>
              </div>
            </Link>
            <Link to="/integrations" style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 12, textDecoration: 'none', transition: 'all 0.15s'
            }}>
              <Tag size={22} style={{ color: 'var(--text-primary)' }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Conectar Marketplace</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mercado Livre, Shopee</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
