import { useState } from 'react';
import { CreditCard, CheckCircle2, AlertCircle, ArrowUpRight, Zap } from 'lucide-react';
import { auth } from '../lib/firebase';

export default function Subscription() {
  const [loading, setLoading] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);

  const isVip = auth.currentUser?.email === 'gbrielcn20@hotmail.com';

  // Mock data for the MVP
  const plan = isVip ? {
    name: 'Plano Diamante VIP',
    status: 'active',
    daysLeft: 9999,
    price: 'R$ 0,00',
    description: 'Você está usando um plano VIP ilimitado.',
    features: [
      'Instâncias de WhatsApp Ilimitadas',
      'Disparos Ilimitados/mês',
      'Banco de Ofertas Ilimitado',
      'IA Avançada (Sem Limites)'
    ]
  } : {
    name: 'Free Trial',
    status: 'active',
    daysLeft: 7,
    price: 'R$ 0,00',
    description: 'Você está usando o plano básico de testes.',
    features: [
      '1 Instância de WhatsApp',
      'Até 50 Envios/mês',
      'Banco de Ofertas Limitado',
      'IA Gemini (Uso Básico)'
    ]
  };

  const handleUpgrade = () => {
    setUpgradeMessage("Integração com Stripe em desenvolvimento. Em breve você poderá fazer o upgrade para o plano Pro!");
    setTimeout(() => setUpgradeMessage(null), 5000);
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-gray-900">Minha Assinatura</h1>
          <p className="text-[14px] text-gray-500 mt-1">Gerencie seu plano, limites e métodos de pagamento.</p>
        </div>
      </div>

      {upgradeMessage && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-[13px] font-medium flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-4 h-4" />
            {upgradeMessage}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-8 md:p-10 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
           <div>
             <div className="flex items-center gap-3 mb-3">
                <span className="bg-indigo-50 text-indigo-700 font-bold px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-wider border border-indigo-100">
                   {plan.name}
                </span>
                {plan.daysLeft <= 7 && (
                   <span className="flex items-center gap-1.5 text-orange-600 text-[12px] font-bold bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
                      <AlertCircle className="w-3.5 h-3.5" /> Expira em {plan.daysLeft} dias
                   </span>
                )}
             </div>
             <h2 className="text-[36px] font-extrabold text-gray-900 mb-1 tracking-tight">
                {plan.price} <span className="text-[16px] font-medium text-gray-500 tracking-normal">/mês</span>
             </h2>
             <p className="text-[14px] text-gray-500">{plan.description}</p>
           </div>
           
           {!isVip && (
             <div className="shrink-0 w-full md:w-auto">
               <button 
                 onClick={handleUpgrade}
                 className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors w-full md:w-auto shadow-sm"
               >
                 Fazer Upgrade para o Pro <ArrowUpRight className="w-4 h-4" />
               </button>
             </div>
           )}
        </div>

        <div className="p-8 md:p-10 bg-gray-50">
          <h3 className="text-[15px] font-bold text-gray-900 mb-6 flex items-center gap-2">
            O que está incluído no seu plano atual:
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {plan.features.map((feature, idx) => (
               <div key={idx} className="flex items-center gap-3">
                 <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                 </div>
                 <span className="text-[14px] font-medium text-gray-700">{feature}</span>
               </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommended Plan */}
      {!isVip && (
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 md:p-12 relative overflow-hidden text-white shadow-lg">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
             <Zap className="w-64 h-64 rotate-12 -translate-y-12 translate-x-12" />
          </div>
          <div className="relative z-10 max-w-xl">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[12px] font-bold uppercase tracking-wider mb-6">
                <Zap className="w-3.5 h-3.5 text-yellow-400" /> Recomendado
             </div>
             <h3 className="text-[28px] font-bold mb-3 tracking-tight">Pronto para escalar suas vendas?</h3>
             <p className="text-[15px] text-indigo-100/80 mb-8 leading-relaxed max-w-md">
               Desbloqueie múltiplas instâncias de WhatsApp, disparos contínuos e acesso total a IA para copywriting por apenas <strong>R$ 97,00/mês</strong>.
             </p>
             <button 
               onClick={handleUpgrade}
               className="bg-white text-indigo-900 px-8 py-3.5 rounded-xl font-bold text-[14px] hover:bg-gray-50 transition-colors shadow-sm"
             >
               Assinar Plano Pro
             </button>
          </div>
        </div>
      )}

    </div>
  );
}
