import { useEffect, useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { Calendar, MousePointerClick, Users, ShoppingCart, Tag, AlertCircle, TrendingUp, HelpCircle, Smartphone, Send, CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardOverview() {
  const [filter, setFilter] = useState('7d');
  const [hasIntegrations, setHasIntegrations] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkIntegrations() {
      try {
        const user = auth.currentUser;
        if (!user) return;
        
        const q = query(collection(db, 'ecommerce_keys'), where('user_id', '==', user.uid));
        const qs = await getDocs(q);
        setHasIntegrations(!qs.empty);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'ecommerce_keys');
      }
      setLoading(false);
    }
    checkIntegrations();
  }, []);

  if (loading) {
     return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-gray-400">
           <Loader2 className="w-8 h-8 animate-spin mb-4" />
           <p className="text-[13px] font-medium">Carregando métricas...</p>
        </div>
     );
  }

  if (!hasIntegrations) {
    return (
      <div className="p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center">
        <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
          <TrendingUp className="w-8 h-8 text-gray-400" />
        </div>
        <h1 className="text-[20px] font-bold text-gray-900 mb-2">Bem-vindo ao Zappio</h1>
        <p className="text-[14px] text-gray-500 max-w-sm mx-auto mb-8 leading-relaxed">
          Para visualizar métricas da sua operação e começar a automatizar, você precisa conectar suas contas.
        </p>
        <Link 
          to="/dashboard/integrations" 
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold text-[14px] shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <ShoppingCart className="w-4 h-4"/>
          Ir para Integrações
        </Link>
      </div>
    );
  }

  // Mock metrics for layout
  const metrics = {
    clicks: 12450,
    buyers: 312,
    orders: 345,
    estimatedSales: "R$ 45.230,00",
    unpaidSales: "R$ 3.120,00",
    estimatedGain: "R$ 4.523,00",
    products: 154,
    activeInstances: 2,
    messagesSent: 45890,
    successRate: "98.5%",
    errorRate: "1.5%"
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-10">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
           {/* Header is handled by Layout now, we can just optionally show a subtitle or remove this. The layout has a top bar. */}
           <p className="text-[14px] text-gray-500">Acompanhe a performance detalhada da sua operação.</p>
        </div>
        
        <div className="flex items-center gap-1 bg-gray-100/50 border border-gray-200 p-1 rounded-lg">
          {[
            { id: 'today', label: 'Hoje' },
            { id: '7d', label: '7 Dias' },
            { id: '30d', label: '30 Dias' },
            { id: 'month', label: 'Este Mês' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${filter === f.id ? 'bg-white text-gray-900 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {f.label}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-300 mx-1"></div>
          <button className="px-2 py-1.5 text-gray-400 hover:text-gray-600 transition-colors">
            <Calendar className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Financial & Performance Metrics */}
      <div>
         <h2 className="text-[12px] font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Desempenho Comercial
         </h2>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
               <div className="flex items-center gap-2 text-gray-500 mb-3">
                  <MousePointerClick className="w-4 h-4" />
                  <span className="text-[12px] font-medium">Cliques Totais</span>
               </div>
               <span className="text-[24px] font-bold text-gray-900">{metrics.clicks.toLocaleString('pt-BR')}</span>
               <span className="text-[12px] text-green-600 mt-1 font-medium">+12% vs período anterior</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
               <div className="flex items-center gap-2 text-gray-500 mb-3">
                  <Users className="w-4 h-4" />
                  <span className="text-[12px] font-medium">Compradores</span>
               </div>
               <span className="text-[24px] font-bold text-gray-900">{metrics.buyers.toLocaleString('pt-BR')}</span>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
               <div className="flex items-center gap-2 text-gray-500 mb-3">
                  <ShoppingCart className="w-4 h-4" />
                  <span className="text-[12px] font-medium">Pedidos</span>
               </div>
               <span className="text-[24px] font-bold text-gray-900">{metrics.orders.toLocaleString('pt-BR')}</span>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
               <div className="flex items-center justify-between text-gray-500 mb-3 group relative">
                  <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  <span className="text-[12px] font-medium">Vendas Totais</span>
                  </div>
                  <HelpCircle className="w-4 h-4 cursor-pointer text-gray-300 hover:text-gray-500" />
               </div>
               <span className="text-[24px] font-bold text-gray-900">{metrics.estimatedSales}</span>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col lg:col-span-2 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-6 opacity-10">
                  <TrendingUp className="w-24 h-24 text-green-500" />
               </div>
               <div className="relative z-10 flex flex-col h-full justify-between">
                  <div>
                     <div className="flex items-center gap-2 text-gray-500 mb-2">
                        <span className="text-[12px] font-semibold uppercase tracking-wider text-green-600">Ganhos Estimados (Comissões)</span>
                     </div>
                     <span className="text-[36px] font-extrabold text-gray-900 tracking-tight">{metrics.estimatedGain}</span>
                  </div>
                  <span className="text-[13px] text-gray-500 mt-4">Projeção conservadora baseada nos relatórios sincronizados.</span>
               </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
               <div className="flex items-center gap-2 text-gray-500 mb-3">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <span className="text-[12px] font-medium">Não Efetivadas</span>
               </div>
               <span className="text-[24px] font-bold text-gray-900">{metrics.unpaidSales}</span>
               <span className="text-[12px] text-gray-400 mt-1">Status: cancelado ou pendente.</span>
            </div>
            
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-xl border border-indigo-100 flex flex-col justify-center items-center text-center">
               <span className="text-[32px] font-extrabold text-indigo-700">{metrics.products}</span>
               <span className="text-[12px] font-semibold text-indigo-600/80 uppercase mt-1 tracking-wider">Produtos Ativos</span>
            </div>
         </div>
      </div>

      {/* Engine Metrics */}
      <div>
         <h2 className="text-[12px] font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
           <Zap className="w-4 h-4" /> Qualidade do Disparo
         </h2>
         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
               <div className="w-10 h-10 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center text-green-600">
                  <Smartphone className="w-5 h-5" />
               </div>
               <div>
                  <span className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider">WhatsApps Ativos</span>
                  <span className="block text-[20px] font-bold text-gray-900">{metrics.activeInstances}</span>
               </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
               <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Send className="w-5 h-5" />
               </div>
               <div>
                  <span className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider">Msg Enviadas</span>
                  <span className="block text-[20px] font-bold text-gray-900">{metrics.messagesSent.toLocaleString('pt-BR')}</span>
               </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
               <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
               </div>
               <div>
                  <span className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider">Taxa de Entrega</span>
                  <span className="block text-[20px] font-bold text-gray-900">{metrics.successRate}</span>
               </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
               <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
                  <XCircle className="w-5 h-5" />
               </div>
               <div>
                  <span className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider">Falha/Bloqueio</span>
                  <span className="block text-[20px] font-bold text-gray-900">{metrics.errorRate}</span>
               </div>
            </div>
         </div>
      </div>

    </div>
  );
}
