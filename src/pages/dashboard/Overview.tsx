import { useEffect, useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { Users, Smartphone, Zap, TrendingUp } from 'lucide-react';

export default function DashboardOverview() {
  const [stats, setStats] = useState({
    instances: 0,
    campaigns: 0,
    groups: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
const user = auth.currentUser;
        if (!user) return;

        const [inst, camp, grp] = await Promise.all([
          getCountFromServer(query(collection(db, 'whatsapp_instances'), where('user_id', '==', user.uid))),
          getCountFromServer(query(collection(db, 'campaigns'), where('user_id', '==', user.uid))),
          getCountFromServer(query(collection(db, 'whatsapp_contacts_groups'), where('user_id', '==', user.uid)))
        ]);

        setStats({
          instances: inst.data().count,
          campaigns: camp.data().count,
          groups: grp.data().count
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'multiple');
      }
      setLoading(false);
    }
    loadStats();
  }, []);

  if (loading) return <div className="p-8">Carregando métricas...</div>;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-[18px] font-bold text-primary">Visão Geral</h1>
        <p className="text-[12px] text-secondary mt-1">Acompanhe a performance da sua operação.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-primary border border-subtle rounded-[12px] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary">Instâncias Ativas</h3>
            <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[32px] font-bold tracking-tight text-primary">{stats.instances}</p>
        </div>

        <div className="bg-primary border border-subtle rounded-[12px] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary">Campanhas Enviadas</h3>
            <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[32px] font-bold tracking-tight text-primary">{stats.campaigns}</p>
        </div>

        <div className="bg-primary border border-subtle rounded-[12px] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary">Alvos/Grupos</h3>
            <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[32px] font-bold tracking-tight text-primary">{stats.groups}</p>
        </div>
      </div>

      <div className="bg-primary border border-subtle rounded-[12px] p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-secondary" />
          <h3 className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary">Atividade Recente</h3>
        </div>
        <div className="text-center py-12 border border-dashed border-subtle rounded-[8px] text-[14px] text-secondary">
          Gráficos e telemetria de cliques em desenvolvimento...
        </div>
      </div>
    </div>
  );
}
