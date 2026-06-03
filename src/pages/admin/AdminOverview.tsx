import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase.js';
import { collection, getCountFromServer } from 'firebase/firestore';
import { ShieldCheck, Users, HardDrive } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils.js';

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
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-800 flex items-center justify-center shadow-lg border border-red-200">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary mb-1">Painel Super Admin</h1>
          <p className="text-secondary text-sm">Controle total da infraestrutura B2B e Tenants.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="bg-primary border border-subtle rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-secondary">Total de Tenants/Usuários</h3>
            <Users className="w-5 h-5 text-secondary" />
          </div>
          <p className="text-5xl font-bold tracking-tighter text-primary">
            {loading ? '...' : usersCount}
          </p>
        </div>
        
        <div className="bg-primary border border-subtle rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-secondary">Instâncias Whatsapp Ativas</h3>
            <HardDrive className="w-5 h-5 text-secondary" />
          </div>
          <p className="text-5xl font-bold tracking-tighter text-primary">
            {loading ? '...' : instancesCount}
          </p>
        </div>
      </div>

      <div className="bg-primary border border-subtle rounded-xl p-6 shadow-sm">
        <h3 className="font-medium text-primary mb-4 border-b border-subtle pb-4">Últimas Transações Financeiras (Stripe)</h3>
        <p className="text-sm text-secondary flex h-32 items-center justify-center border-2 border-dashed border-subtle rounded-md">
          Módulo de webhook do Stripe não implementado no exemplo.
        </p>
      </div>
    </div>
  );
}
