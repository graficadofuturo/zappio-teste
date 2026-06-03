import { useEffect, useState } from 'react';
import { auth, db, GLOBAL_USER_ID } from '../lib/firebase.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils.js';
import { Calendar, MousePointerClick, Users, ShoppingCart, Tag, AlertCircle, TrendingUp, HelpCircle, Smartphone, Send, CheckCircle2, XCircle, Loader2, Zap, MessageSquare, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardOverview() {
  const [filter, setFilter] = useState('7d');
  const [hasIntegrations, setHasIntegrations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
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
      try {
        const q = query(collection(db, 'ecommerce_keys'), where('user_id', '==', GLOBAL_USER_ID));
        const qs = await getDocs(q);
        setHasIntegrations(!qs.empty);
      } catch (e) {
        console.error("ecommerce_keys error", e);
      }

      try {
        // Fetch real metrics
        const qProducts = query(collection(db, 'products'), where('user_id', '==', GLOBAL_USER_ID));
        const qsProducts = await getDocs(qProducts);
        const productDocs = qsProducts.docs.map(d => ({ id: d.id, ...d.data() }));
        setProducts(productDocs);

        // Mock sales/performance metrics + real entity counts
        setMetrics(prev => ({
          ...prev,
          clicks: 12450,
          buyers: 312,
          orders: 345,
          estimatedSales: "R$ 45.230,00",
          unpaidSales: "R$ 3.120,00",
          estimatedGain: "R$ 4.523,00",
          messagesSent: 45890,
          successRate: "98.5%",
          errorRate: "1.5%",
          products: qsProducts.size
        }));
      } catch (e) {
        console.error("products error", e);
      }

      try {
        const qInstances = query(collection(db, 'whatsapp_instances'), where('user_id', '==', GLOBAL_USER_ID));
        const qsInstances = await getDocs(qInstances);
        const instanceDocs = qsInstances.docs.map(d => ({ id: d.id, ...d.data() }));
        setInstances(instanceDocs);
        const activeInstancesCount = instanceDocs.filter((d: any) => d.status === 'open').length;

        setMetrics(prev => ({
          ...prev,
          activeInstances: activeInstancesCount
        }));
      } catch (e) {
        console.error("whatsapp_instances error", e);
      }

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

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Msgs Enviadas', value: metrics.messagesSent.toLocaleString('pt-BR'), delta: '+12%', icon: MessageSquare, bg: 'rgba(16, 185, 129, 0.08)', color: 'var(--green)' },
          { label: 'Taxa de Entrega', value: metrics.successRate, delta: '+0.3%', icon: CheckCircle2, bg: 'rgba(16, 185, 129, 0.08)', color: 'var(--green)' },
          { label: 'Cliques', value: metrics.clicks.toLocaleString('pt-BR'), delta: '+8%', icon: MousePointerClick, bg: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' },
          { label: 'Compradores', value: metrics.buyers.toLocaleString('pt-BR'), delta: '+5%', icon: Users, bg: 'rgba(167, 139, 250, 0.08)', color: '#a78bfa' },
          { label: 'Ganhos Est.', value: metrics.estimatedGain, delta: '+18%', icon: DollarSign, bg: 'rgba(234, 179, 8, 0.08)', color: 'var(--yellow)' },
          { label: 'Falha/Bloqueio', value: metrics.errorRate, delta: '-0.2%', icon: AlertCircle, bg: 'rgba(239, 68, 68, 0.08)', color: '#f87171' },
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
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: m.delta.startsWith('+') ? 'var(--green-glow)' : 'rgba(239,68,68,0.12)',
                  color: m.delta.startsWith('+') ? 'var(--green)' : '#f87171',
                  border: m.delta.startsWith('+') ? '1px solid var(--border-green)' : '1px solid rgba(239,68,68,0.25)'
                }}>{m.delta}</span>
              </div>
              <div className="metric-value" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{m.value}</div>
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
              <span style={{ fontSize: 22 }}>🚀</span>
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
              <span style={{ fontSize: 22 }}>🛍️</span>
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
              <span style={{ fontSize: 22 }}>🔗</span>
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
