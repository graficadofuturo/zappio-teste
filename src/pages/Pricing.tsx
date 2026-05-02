import { Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Pricing() {
  return (
    <div className="min-h-screen bg-primary">
      <header className="max-w-7xl mx-auto px-6 h-[72px] border-b border-subtle flex items-center">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 flex-shrink-0 bg-accent rounded-md"></div>
          <span className="text-[18px] font-extrabold tracking-[-0.02em] text-primary">ZapBot AI</span>
        </Link>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-24 text-center">
        <h1 className="text-[48px] md:text-[64px] tracking-[-0.02em] font-extrabold text-primary mb-6">Planos que escalam com você.</h1>
        <p className="text-[16px] md:text-[18px] text-secondary max-w-2xl mx-auto mb-16 leading-[1.6]">
          Acesso completo a todas as ferramentas de automação, integrações e IAs para maximizar seu tráfego de afiliados.
        </p>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto text-left">
          {/* Pro Plan */}
          <motion.div 
            whileHover={{ y: -5 }}
            className="p-8 rounded-[12px] border border-subtle bg-primary shadow-sm hover:shadow-md transition-all flex flex-col"
          >
            <h3 className="text-[24px] font-bold text-primary tracking-[-0.02em] mb-2">Pro Afiliado</h3>
            <div className="flex items-end gap-1 mb-6">
              <span className="text-[40px] font-extrabold tracking-[-0.02em] text-primary">R$97</span>
              <span className="text-secondary mb-1">/mês</span>
            </div>
            <p className="text-[14px] text-secondary mb-8 border-b border-subtle pb-6">Para quem está escalando os primeiros grupos e funis de Whats.</p>
            
            <ul className="space-y-4 mb-8 flex-1">
              {['1 Instância de WhatsApp', 'Contatos Ilimitados', 'Integração Amazon/Shopee', 'Gerador de Copy (Gemini)', 'Suporte Email'].map((ft) => (
                <li key={ft} className="flex items-center gap-3 text-[14px] text-primary font-medium">
                  <CheckCircle2 className="h-5 w-5 text-[#10b981] shrink-0" /> {ft}
                </li>
              ))}
            </ul>

            <Link to="/auth/register" className="w-full block text-center bg-transparent text-primary border border-subtle py-3 rounded-[8px] font-semibold text-[14px] hover:bg-secondary transition-colors">
              Começar Agora
            </Link>
          </motion.div>

          {/* Scale Plan */}
          <motion.div 
            whileHover={{ y: -5 }}
            className="p-8 rounded-[12px] border-2 border-accent bg-primary shadow-sm relative flex flex-col"
          >
            <div className="absolute top-0 right-8 -translate-y-1/2 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-[0.05em]">
              Mais Popular
            </div>
            <h3 className="text-[24px] font-bold text-primary tracking-[-0.02em] mb-2">Agência & Scale</h3>
            <div className="flex items-end gap-1 mb-6">
              <span className="text-[40px] font-extrabold tracking-[-0.02em] text-primary">R$297</span>
              <span className="text-secondary mb-1">/mês</span>
            </div>
            <p className="text-[14px] text-secondary mb-8 border-b border-subtle pb-6">Para operações monstras que precisam separar nichos e IPs.</p>
            
            <ul className="space-y-4 mb-8 flex-1">
              {['10 Instâncias de WhatsApp', 'Importação Mágica de Contatos', 'Multi-Integrações V-2', 'IA Gemini Avançada (Visão)', 'Suporte Prioritário Whatsapp'].map((ft) => (
                <li key={ft} className="flex items-center gap-3 text-[14px] text-primary font-medium">
                  <CheckCircle2 className="h-5 w-5 text-[#10b981] shrink-0" /> {ft}
                </li>
              ))}
            </ul>

            <Link to="/auth/register" className="w-full block text-center bg-accent text-white py-3 rounded-[8px] font-semibold text-[14px] hover:bg-accent-hover transition-colors">
              Assinar Agora
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="bg-secondary py-16 mt-12 border-t border-subtle">
         <div className="max-w-4xl mx-auto px-6 text-center">
            <ShieldCheck className="h-10 w-10 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold tracking-tight text-primary mb-2">Pagamento 100% Seguro</h3>
            <p className="text-secondary">Utilizamos Stripe para processar seus pagamentos. Não armazenamos seus cartões.</p>
         </div>
      </section>
    </div>
  );
}
