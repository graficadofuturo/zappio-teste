import { useState } from 'react';
import { Check, HelpCircle, ExternalLink, Sprout, Zap, Crown } from 'lucide-react';

const plans = [
  {
    id: 'free',
    name: 'Free',
    icon: Sprout,
    price: 0,
    priceLabel: 'Grátis',
    period: 'para sempre',
    description: 'Perfeito para testar o Zappio.',
    color: 'var(--text-muted)',
    iconColor: 'var(--text-muted)',
    features: [
      '1 instância de WhatsApp',
      '50 disparos por mês',
      'Banco de Ofertas ML',
      'Suporte via e-mail',
    ],
    limits: [
      'Sem campanhas automáticas',
      'Sem agendamento',
      'Sem IA de copywriting',
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Zap,
    price: 97,
    priceLabel: 'R$ 97',
    period: 'por mês',
    description: 'Para afiliados que querem crescer.',
    color: 'var(--green)',
    iconColor: 'var(--green)',
    popular: true,
    features: [
      '3 instâncias de WhatsApp',
      '2.000 disparos por mês',
      'Campanhas automáticas',
      'Agendamento avançado',
      'IA de copywriting',
      'Mercado Livre + Shopee',
      'Suporte prioritário',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    icon: Crown,
    price: 297,
    priceLabel: 'R$ 297',
    period: 'por mês',
    description: 'Para times e alto volume.',
    color: '#a78bfa',
    iconColor: '#a78bfa',
    features: [
      'Instâncias ilimitadas',
      'Disparos ilimitados',
      'Tudo do Pro',
      'API de integração',
      'White-label',
      'Gerente de conta dedicado',
      'SLA garantido',
    ],
  },
];

export default function Subscription() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const currentPlan = 'free'; // This would come from Firebase in production

  return (
    <div className="page-content">
      <div className="page-header" style={{ textAlign: 'center' }}>
        <h1 className="page-title" style={{ fontSize: 28 }}>Escolha seu Plano</h1>
        <p className="page-subtitle" style={{ maxWidth: 480, margin: '0 auto' }}>Escale suas vendas com automação inteligente de WhatsApp e links de afiliado.</p>
      </div>

      {/* Billing Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 48 }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 12, padding: 4, display: 'flex', gap: 4
        }}>
          {(['monthly', 'annual'] as const).map(b => (
            <button
              key={b}
              className={billing === b ? 'tab-item active' : 'tab-item'}
              onClick={() => setBilling(b)}
              style={{ padding: '8px 20px' }}
            >
              {b === 'monthly' ? 'Mensal' : 'Anual'}
              {b === 'annual' && <span style={{ fontSize: 10, background: 'var(--green)', color: '#022c1a', borderRadius: 99, padding: '1px 6px', marginLeft: 6, fontWeight: 800 }}>-20%</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Plans Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
        {plans.map(plan => {
          const isCurrent = plan.id === currentPlan;
          const isPopular = plan.popular;
          const price = billing === 'annual' && plan.price > 0
            ? Math.round(plan.price * 0.8)
            : plan.price;

          return (
            <div
              key={plan.id}
              style={{
                background: isPopular ? 'var(--bg-card)' : 'var(--bg-card)',
                border: isPopular ? '2px solid var(--green)' : '1px solid var(--border-subtle)',
                borderRadius: 20, padding: 28, position: 'relative', overflow: 'hidden',
                boxShadow: isPopular ? 'var(--shadow-glow-green)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              {/* Popular Badge */}
              {isPopular && (
                <div style={{
                  position: 'absolute', top: 16, right: 16,
                  background: 'var(--green)', color: '#022c1a',
                  fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 99,
                  textTransform: 'uppercase', letterSpacing: '0.5px'
                }}>Mais Popular</div>
              )}

              {/* Plan Header */}
              <div style={{ marginBottom: 24 }}>
                <span style={{ display: 'block', marginBottom: 12, color: plan.iconColor }}>
                  <plan.icon size={32} strokeWidth={1.8} />
                </span>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 800, color: plan.color, marginBottom: 4 }}>
                  {plan.name}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{plan.description}</p>
              </div>

              {/* Price */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 36, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {price === 0 ? 'Grátis' : `R$ ${price}`}
                  </span>
                  {price > 0 && (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/mês</span>
                  )}
                </div>
                {billing === 'annual' && price > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--green)', marginTop: 4, fontWeight: 600 }}>
                    Economize R$ {(plan.price - price) * 12}/ano
                  </p>
                )}
              </div>

              {/* Features */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--green-glow)', border: '1px solid var(--border-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Check size={11} color="var(--green)" strokeWidth={3} />
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{f}</span>
                  </div>
                ))}
                {plan.limits?.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, opacity: 0.4 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>✕</span>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {isCurrent ? (
                <button className="btn btn-secondary" style={{ width: '100%', cursor: 'default' }} disabled>
                  ✓ Plano Atual
                </button>
              ) : plan.id === 'free' ? (
                <button className="btn btn-ghost" style={{ width: '100%' }} disabled>
                  Gratuito
                </button>
              ) : (
                <button
                  className={`btn ${isPopular ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                  style={{ width: '100%' }}
                  onClick={() => window.open('https://wa.me/5511999999999?text=Quero+contratar+o+plano+' + plan.name, '_blank')}
                >
                  <ExternalLink size={15} /> Contratar {plan.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* FAQ Section */}
      <div style={{ marginTop: 64, maxWidth: 700, margin: '64px auto 0' }}>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 32, color: 'var(--text-primary)' }}>Perguntas Frequentes</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { q: 'Como funciona o link de afiliado?', a: 'O Zappio converte automaticamente os links dos produtos para links com seu ID de afiliado do Mercado Livre, garantindo que você receba a comissão em cada venda.' },
            { q: 'Posso cancelar a qualquer momento?', a: 'Sim! Não há fidelidade. Você pode cancelar quando quiser e continua tendo acesso até o fim do período pago.' },
            { q: 'O WhatsApp pode ser banido?', a: 'O Zappio usa o protocolo oficial do WhatsApp (Baileys) com envios espaçados e humanizados para minimizar o risco de ban. Siga as boas práticas recomendadas.' },
          ].map(faq => (
            <div key={faq.q} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <HelpCircle size={18} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{faq.q}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{faq.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
