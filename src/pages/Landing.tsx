import { Link } from 'react-router-dom';
import { Bot, ArrowRight, Zap, Target, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between border-b border-subtle">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex-shrink-0 bg-accent rounded-md"></div>
          <span className="text-[18px] font-extrabold tracking-[-0.02em]">ZapBot AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/auth/login" className="text-[14px] font-[600] text-secondary hover:text-primary transition-colors">Entrar</Link>
          <Link to="/auth/register" className="text-[14px] font-[600] bg-accent text-white px-5 py-2.5 rounded-[8px] hover:bg-accent-hover transition-colors">Começar Grátis</Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-[6px] bg-secondary border border-subtle text-[10px] font-mono font-bold uppercase text-secondary mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></span>
          Sistema Multi-Instância Ativo
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-[48px] md:text-[64px] font-extrabold tracking-[-0.02em] text-primary max-w-4xl leading-tight mb-6"
        >
          Automação de Afiliados no WhatsApp Muta de Nível.
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-[16px] md:text-[18px] text-secondary max-w-2xl mb-10 leading-[1.6]"
        >
          Disparos inteligentes, copywriting via IA Gemini e integração nativa com Amazon, Mercado Livre e Shopee. Tudo numa interface focada em performance.
        </motion.p>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <Link to="/auth/register" className="flex items-center justify-center gap-2 bg-accent text-white px-8 py-4 rounded-[8px] font-semibold text-[14px] hover:bg-accent-hover transition-all">
            Criar Minha Conta <ArrowRight className="h-5 w-5" />
          </Link>
          <Link to="/pricing" className="flex items-center justify-center gap-2 bg-transparent text-primary px-8 py-4 rounded-[8px] font-semibold text-[14px] border border-subtle hover:bg-secondary transition-all">
            Ver Planos
          </Link>
        </motion.div>
      </section>

      {/* Features Minimalist */}
      <section className="bg-secondary border-t border-b border-subtle">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary border border-subtle flex items-center justify-center">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-primary tracking-tight">Segmentação Exata</h3>
              <p className="text-secondary leading-relaxed">Dispare em massa ou direcione para grupos específicos. Arquitetura Multi-Device para separar nichos de atuação.</p>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary border border-subtle flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-primary tracking-tight">Copywriting com IAs</h3>
              <p className="text-secondary leading-relaxed">Deixe o Google Gemini gerar gatilhos mentais perfeitos para seus links de afiliado Amazon e Shopee instantaneamente.</p>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary border border-subtle flex items-center justify-center">
                <BarChart2 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-primary tracking-tight">Otimização de ROI</h3>
              <p className="text-secondary leading-relaxed">Acompanhe taxas de envio e falhas ao vivo via Evolution API. Interface minimalista sem distrações.</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 text-center border-t border-subtle mt-12">
        <p className="text-sm text-muted font-mono">© 2026 ZapBot B2B SaaS. Arquitetura Serverless & Evolution API.</p>
      </footer>
    </div>
  );
}
