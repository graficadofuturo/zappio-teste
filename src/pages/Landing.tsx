import { Link } from 'react-router-dom';
import { Bot, ArrowRight, Zap, Target, BarChart2, Smartphone, Users, Link as LinkIcon, MessageSquare, Boxes, RefreshCw, Layers, CheckCircle2, MonitorSmartphone } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#111827] font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 flex-shrink-0 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-[18px] font-extrabold tracking-tight text-gray-900">Zappio</span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-[14px] font-medium text-gray-600 hover:text-gray-900 transition-colors">Recursos</a>
            <a href="#how-it-works" className="text-[14px] font-medium text-gray-600 hover:text-gray-900 transition-colors">Como funciona</a>
            <a href="#integrations" className="text-[14px] font-medium text-gray-600 hover:text-gray-900 transition-colors">Integrações</a>
            <a href="#pricing" className="text-[14px] font-medium text-gray-600 hover:text-gray-900 transition-colors">Preços</a>
            <a href="#faq" className="text-[14px] font-medium text-gray-600 hover:text-gray-900 transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-4">
            <Link to="/auth/login" className="hidden sm:block text-[14px] font-semibold text-gray-600 hover:text-gray-900 transition-colors">Entrar</Link>
            <Link to="/auth/register" className="text-[14px] font-semibold bg-gray-900 text-white px-5 py-2 rounded-lg hover:bg-gray-800 transition-all shadow-sm">
              Começar agora
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col items-center text-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-[12px] font-semibold text-indigo-700 mb-8"
            >
              <Zap className="w-4 h-4" />
              Novo: Integração oficial com plataformas parceiras
            </motion.div>

            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-[48px] md:text-[64px] font-extrabold tracking-tight text-gray-900 max-w-4xl leading-[1.1] mb-6"
            >
              Automatize ofertas no WhatsApp e <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500">venda no piloto automático</span>
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-[18px] md:text-[20px] text-gray-600 max-w-2xl mb-10 leading-relaxed"
            >
              Conecte seu WhatsApp, escolha seus nichos e deixe o Zappio buscar ofertas, criar mensagens com IA e enviar automaticamente para seus contatos e grupos.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
            >
              <Link to="/auth/register" className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-[16px] hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md w-full sm:w-auto">
                Começar agora <ArrowRight className="h-5 w-5" />
              </Link>
              <a href="#how-it-works" className="flex items-center justify-center gap-2 bg-white text-gray-700 px-8 py-4 rounded-xl font-bold text-[16px] border border-gray-200 hover:bg-gray-50 transition-all w-full sm:w-auto shadow-sm">
                Ver como funciona
              </a>
            </motion.div>
        </div>

        {/* Hero Visual Mockup */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-5xl mx-auto px-6 mt-20 relative"
        >
           <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden flex flex-col md:flex-row relative">
              {/* Dashboard Side */}
              <div className="flex-1 p-8 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/50">
                 <div className="flex items-center justify-between mb-8">
                    <div>
                      <div className="text-[14px] font-bold text-gray-900 mb-1">Campanhas Ativas</div>
                      <div className="text-[12px] text-gray-500">Visão geral de desempenho</div>
                    </div>
                    <div className="flex gap-2">
                       <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><BarChart2 className="w-4 h-4"/></div>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                       <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Mensagens</div>
                       <div className="text-[24px] font-bold text-gray-900">12.450</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                       <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Cliques</div>
                       <div className="text-[24px] font-bold text-indigo-600">3.892</div>
                    </div>
                 </div>

                 <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-100">
                         <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            <span className="text-[13px] font-medium text-gray-700">Promoção Smartphones {i}</span>
                         </div>
                         <span className="text-[12px] font-medium text-gray-500 text-right">Enviando...</span>
                      </div>
                    ))}
                 </div>
              </div>

              {/* Phone Side */}
              <div className="w-full md:w-[320px] bg-[#efeae2] p-6 flex flex-col pt-10 relative">
                 <div className="absolute top-2 w-16 h-1.5 bg-gray-300 rounded-full left-1/2 -translate-x-1/2"></div>
                 <div className="bg-white p-3 rounded-tr-xl rounded-b-xl shadow-sm mb-4 max-w-[90%] relative">
                   <div className="w-full h-32 bg-gray-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <MonitorSmartphone className="w-8 h-8 text-gray-400" />
                      </div>
                   </div>
                   <p className="text-[13px] text-gray-800 leading-relaxed font-sans whitespace-pre-wrap">
                      🔥 Oferta relâmpago!
                      <br/><br/>
                      <strong>Smartphone Samsung Galaxy S23</strong>
                      <br/><br/>
                      De ~R$ 5.999,00~
                      por apenas <strong>R$ 3.999,00</strong>
                      <br/><br/>
                      Garanta antes que acabe:
                      <a href="#" className="text-blue-500 underline ml-1">https://zapp.io/link</a>
                   </p>
                   <span className="text-[10px] text-gray-400 absolute bottom-2 right-2 flex items-center gap-1">14:03 <CheckCircle2 className="w-3 h-3 text-blue-500" /></span>
                 </div>
              </div>
           </div>
        </motion.div>
      </section>

      {/* Como Funciona */}
      <section id="how-it-works" className="py-24 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[32px] font-bold text-gray-900 mb-4 tracking-tight">Como funciona o Zappio?</h2>
            <p className="text-[16px] text-gray-600 max-w-2xl mx-auto">Em apenas 4 passos você transforma seu WhatsApp em uma máquina automática de vendas afiliadas.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 relative">
             <div className="hidden md:block absolute top-[40px] left-[10%] right-[10%] h-[2px] bg-gray-100 -z-10"></div>
             
             {[
               { icon: Smartphone, title: "1. Conecte seu WhatsApp", desc: "Escaneie o QR Code e conecte sua conta em segundos." },
               { icon: Users, title: "2. Escolha o destino", desc: "Selecione para qual grupo, contato ou lista de transmissão deseja enviar." },
               { icon: Target, title: "3. Selecione os produtos", desc: "Defina nichos, categorias ou deixe o Zappio buscar as ofertas." },
               { icon: Zap, title: "4. Disparo Automático", desc: "O Zappio cria a copy, e envia automaticamente." }
             ].map((step, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-6 relative z-10">
                     <step.icon className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h3 className="text-[18px] font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-[14px] text-gray-600 leading-relaxed relative z-10 bg-white/80">{step.desc}</p>
                </div>
             ))}
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="features" className="py-24 bg-gray-50 border-t border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[32px] font-bold text-gray-900 mb-4 tracking-tight">Tudo que você precisa para escalar</h2>
            <p className="text-[16px] text-gray-600 max-w-2xl mx-auto">Recursos pensados para maximizar suas conversões e economizar seu tempo no WhatsApp.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
             {[
                { title: "Disparo Automático", icon: Zap, desc: "Agende intervalos ou deixe em disparo contínuo sem intervenção manual." },
                { title: "Múltiplos WhatsApps", icon: Smartphone, desc: "Conecte várias instâncias e escale suas campanhas." },
                { title: "Copywriting com IA", icon: Bot, desc: "A IA cria textos persuasivos e gatilhos mentais para cada produto." },
                { title: "Histórico Inteligente", icon: RefreshCw, desc: "O sistema lembra o que já foi enviado para nunca repetir o mesmo produto por engano." },
                { title: "Preview Fiel", icon: MonitorSmartphone, desc: "Veja exatamente como a mensagem vai chegar no celular do seu cliente." },
                { title: "Métricas de Desempenho", icon: BarChart2, desc: "Acompanhe cliques, mensagens enviadas e falhas no painel de controle." }
             ].map((feat, i) => (
                <div key={i} className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-6">
                    <feat.icon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="text-[18px] font-bold text-gray-900 mb-2">{feat.title}</h3>
                  <p className="text-[14px] text-gray-600 leading-relaxed">{feat.desc}</p>
                </div>
             ))}
          </div>
        </div>
      </section>

      {/* Integrações */}
      <section id="integrations" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1">
             <h2 className="text-[32px] font-bold text-gray-900 mb-6 tracking-tight">Integrado com as maiores Plataformas</h2>
             <p className="text-[16px] text-gray-600 mb-8 leading-relaxed max-w-lg">
                Conecte suas contas de venda ou afiliado e centralize produtos, métricas e campanhas. Nosso sistema puxa informações direto da fonte.
             </p>
             <div className="grid grid-cols-2 gap-4">
                {['Mercado Livre', 'Amazon', 'Shopee', 'AliExpress'].map(m => (
                  <div key={m} className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50">
                    <LinkIcon className="w-4 h-4 text-gray-400" />
                    <span className="text-[14px] font-bold text-gray-700">{m}</span>
                  </div>
                ))}
             </div>
          </div>
          <div className="flex-1 w-full relative">
             <div className="absolute inset-0 bg-gradient-to-tr from-indigo-50 to-blue-50 rounded-full blur-3xl opacity-50"></div>
             <div className="relative bg-white p-8 rounded-3xl border border-gray-200 shadow-xl">
                 <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-[#FFE600] flex items-center justify-center">
                            <span className="font-bold text-[#2d3277] text-[10px]">ML</span>
                         </div>
                         <div>
                            <div className="text-[14px] font-bold text-gray-900">Mercado Livre Afiliados</div>
                            <div className="text-[12px] text-green-600 font-medium">Conectado</div>
                         </div>
                       </div>
                       <button className="text-[12px] font-semibold text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg">Sincronizar</button>
                    </div>
                    <div className="flex items-center justify-between text-[13px] text-gray-600">
                       <span>Produtos disponíveis</span>
                       <span className="font-bold text-gray-900">12.482</span>
                    </div>
                 </div>
             </div>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="pricing" className="py-24 bg-gray-50 border-t border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[32px] font-bold text-gray-900 mb-4 tracking-tight">Planos simples e transparentes</h2>
            <p className="text-[16px] text-gray-600 max-w-2xl mx-auto">Escolha o plano ideal para você.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
             {/* Starter */}
             <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm flex flex-col">
                <h3 className="text-[20px] font-bold text-gray-900 mb-2">Starter</h3>
                <p className="text-[14px] text-gray-500 mb-6 min-h-[40px]">Para quem está começando nas vendas.</p>
                <div className="mb-8">
                   <span className="text-[36px] font-extrabold text-gray-900">R$ 47</span><span className="text-[16px] text-gray-500">/mês</span>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                   {['1 WhatsApp conectado', 'Campanhas básicas', 'X mensagens/mês', 'IA limitada'].map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                         <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />
                         <span className="text-[14px] text-gray-700">{item}</span>
                      </li>
                   ))}
                </ul>
                <Link to="/auth/register" className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-900 font-bold text-center hover:border-gray-900 transition-colors block">
                  Começar no Starter
                </Link>
             </div>

             {/* Pro */}
             <div className="bg-gray-900 p-8 rounded-3xl border border-gray-800 shadow-xl flex flex-col relative transform md:-translate-y-4">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white px-4 py-1 rounded-full text-[12px] font-bold uppercase tracking-wider">
                  Recomendado
                </div>
                <h3 className="text-[20px] font-bold text-white mb-2">Pro</h3>
                <p className="text-[14px] text-gray-400 mb-6 min-h-[40px]">Para escalar suas vendas.</p>
                <div className="mb-8">
                   <span className="text-[36px] font-extrabold text-white">R$ 97</span><span className="text-[16px] text-gray-400">/mês</span>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                   {['Até 3 WhatsApps conectados', 'Campanhas ilimitadas', 'Métricas detalhadas', 'Copywriter IA 100% liberado', 'Suporte prioritário'].map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                         <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                         <span className="text-[14px] text-gray-300">{item}</span>
                      </li>
                   ))}
                </ul>
                <Link to="/auth/register" className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-center hover:bg-indigo-500 transition-colors shadow-none block">
                  Assinar Plano Pro
                </Link>
             </div>

             {/* Agência */}
             <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm flex flex-col">
                <h3 className="text-[20px] font-bold text-gray-900 mb-2">Agência</h3>
                <p className="text-[14px] text-gray-500 mb-6 min-h-[40px]">Para múltiplas operações.</p>
                <div className="mb-8">
                   <span className="text-[36px] font-extrabold text-gray-900">R$ 297</span><span className="text-[16px] text-gray-500">/mês</span>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                   {['WhatsApps ilimitados', 'Volume sob demanda', 'Relatórios avançados', 'Atendimento preferencial'].map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                         <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />
                         <span className="text-[14px] text-gray-700">{item}</span>
                      </li>
                   ))}
                </ul>
                <a href="mailto:vendas@zapp.io" className="w-full py-3 rounded-xl border-2 border-gray-200 text-gray-900 font-bold text-center hover:border-gray-900 transition-colors block">
                  Falar com Vendas
                </a>
             </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-6">
           <div className="text-center mb-16">
             <h2 className="text-[32px] font-bold text-gray-900 tracking-tight">Perguntas Frequentes</h2>
           </div>
           <div className="space-y-4">
              {[
                {q: "Preciso entender de API para usar?", a: "De forma alguma. Criamos o Zappio para ser plug-and-play. Basta escanear o QR code do seu WhatsApp e estar pronto."},
                {q: "Funciona para afiliados?", a: "Totalmente. Projetado especificamente para que afiliados possam automatizar disparos aos seus leads de maneira simples e eficiente."},
                {q: "O envio é realmente automático?", a: "100%. Você configura as campanhas, define os intervalos (ex: a cada 60 minutos) e o Zappio trabalha por você em segundo plano."},
                {q: "O sistema evita repetir produtos no grupo?", a: "Sim! Toda campanha possui um histórico persistente para nunca repetir conteúdo na mesma campanha."}
              ].map((faq, i) => (
                 <div key={i} className="border border-gray-200 rounded-2xl p-6 bg-gray-50">
                    <h3 className="text-[16px] font-bold text-gray-900 mb-2">{faq.q}</h3>
                    <p className="text-[14px] text-gray-600 leading-relaxed">{faq.a}</p>
                 </div>
              ))}
           </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-24 bg-indigo-600">
         <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-[36px] md:text-[48px] font-extrabold text-white mb-6 tracking-tight">Pronto para automatizar?</h2>
            <p className="text-[18px] text-indigo-100 mb-10 max-w-2xl mx-auto">Crie sua conta agora e comece a transformar seu WhatsApp.</p>
            <Link to="/auth/register" className="inline-flex items-center justify-center gap-2 bg-white text-indigo-600 px-10 py-5 rounded-2xl font-bold text-[18px] hover:bg-gray-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1">
               Começar Agora
            </Link>
         </div>
      </section>

      {/* Footer */}
      <footer className="bg-white pt-16 pb-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
              <div className="col-span-2">
                 <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 flex-shrink-0 bg-indigo-600 rounded flex items-center justify-center">
                        <Zap className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-[16px] font-extrabold tracking-tight text-gray-900">Zappio</span>
                 </div>
                 <p className="text-[14px] text-gray-500 max-w-sm mb-6">A plataforma de automação e vendas pelo WhatsApp.</p>
              </div>
              <div>
                 <h4 className="font-bold text-gray-900 mb-4 text-[14px]">Links Úteis</h4>
                 <ul className="space-y-3">
                    <li><a href="#features" className="text-[14px] text-gray-500 hover:text-gray-900">Recursos</a></li>
                    <li><a href="#pricing" className="text-[14px] text-gray-500 hover:text-gray-900">Preços</a></li>
                    <li><a href="mailto:contato@zapp.io" className="text-[14px] text-gray-500 hover:text-gray-900">Contato</a></li>
                 </ul>
              </div>
           </div>
           <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-[13px] text-gray-400">© 2026 Zappio. Todos os direitos reservados.</p>
           </div>
        </div>
      </footer>
    </div>
  );
}
