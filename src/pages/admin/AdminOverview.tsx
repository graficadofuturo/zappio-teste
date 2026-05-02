import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getCountFromServer } from 'firebase/firestore';
import { ShieldCheck, Users, HardDrive } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';

export default function AdminOverview() {
  const [usersCount, setUsersCount] = useState(0);
  const [instancesCount, setInstancesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGlobalStats() {
      try {
        const [uRes, iRes] = await Promise.all([
          getCountFromServer(collection(db, 'users')),
          getCountFromServer(collection(db, 'whatsapp_instances'))
        ]);
        setUsersCount(uRes.data().count);
        setInstancesCount(iRes.data().count);
      } catch (e: any) {
        handleFirestoreError(e, OperationType.GET, 'multiple');
      }
      setLoading(false);
    }
    loadGlobalStats();
  }, []);

  return (
    <div className="p-8">
      <div className="mb-10 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-900 flex items-center justify-center shadow-lg border border-red-500/30">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Painel Super Admin</h1>
          <p className="text-gray-400">Controle total da infraestrutura B2B e Tenants.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-400">Total de Tenants/Usuários</h3>
            <Users className="w-5 h-5 text-gray-500" />
          </div>
          <p className="text-5xl font-bold tracking-tighter text-white">
            {loading ? '...' : usersCount}
          </p>
        </div>
        
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-400">Instâncias Whatsapp Ativas</h3>
            <HardDrive className="w-5 h-5 text-gray-500" />
          </div>
          <p className="text-5xl font-bold tracking-tighter text-white">
            {loading ? '...' : instancesCount}
          </p>
        </div>
      </div>

      <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6 shadow-sm">
        <h3 className="font-medium text-white mb-4 border-b border-[#2a2a2a] pb-4">Últimas Transações Financeiras (Stripe)</h3>
        <p className="text-sm text-gray-500 flex h-32 items-center justify-center border-2 border-dashed border-[#2a2a2a] rounded-md">
          Módulo de webhook do Stripe não implementado no exemplo.
        </p>
      </div>
    </div>
  );
}
