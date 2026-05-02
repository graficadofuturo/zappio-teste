import { useEffect, useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, setDoc, serverTimestamp, orderBy, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { Smartphone, Plus, QrCode, Trash2, Loader2, RefreshCw, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Instance {
  id: string;
  instance_name: string;
  status: string;
  phone_number: string;
}

export default function WhatsAppInstances() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  
  // State for active QR Code modal
  const [activeQRInstance, setActiveQRInstance] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>('');

  useEffect(() => {
    loadInstances();
  }, []);

  useEffect(() => {
    let interval: any;
    if (activeQRInstance) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/whatsapp/status?instanceId=${activeQRInstance}`);
          const data = await res.json();
          setQrStatus(data.status);
          if (data.qr) {
            setQrCodeData(data.qr);
          }
          if (data.status === 'connected') {
            setActiveQRInstance(null);
            setQrCodeData(null);
            // Update firestore status
            await updateDoc(doc(db, 'whatsapp_instances', activeQRInstance), {
              status: 'connected'
            });

            // Fetch and save groups and contacts
            try {
              const syncRes = await fetch(`/api/whatsapp/sync?instanceId=${activeQRInstance}`);
              const syncData = await syncRes.json();
              if (syncData.groups || syncData.contacts) {
                 for (const g of (syncData.groups || [])) {
                    await setDoc(doc(db, 'whatsapp_contacts_groups', `${activeQRInstance}_${g.id}`), {
                      user_id: auth.currentUser?.uid,
                      name: g.subject || 'Grupo Desconhecido',
                      type: 'group',
                      jid: g.id,
                      participants_count: g.participants?.length || 0,
                      updated_at: new Date()
                    }, { merge: true });
                 }
                 for (const c of (syncData.contacts || [])) {
                    await setDoc(doc(db, 'whatsapp_contacts_groups', `${activeQRInstance}_${c.id}`), {
                      user_id: auth.currentUser?.uid,
                      name: c.name || c.notify || c.verifiedName || c.id.split('@')[0],
                      type: 'contact',
                      jid: c.id,
                      updated_at: new Date()
                    }, { merge: true });
                 }
              }
            } catch (e) {
              console.error('Failed to sync contacts and groups', e);
            }
            loadInstances();
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeQRInstance]);

  const loadInstances = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user) {
        const q = query(collection(db, 'whatsapp_instances'), where('user_id', '==', user.uid), orderBy('created_at', 'desc'));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Instance));
        setInstances(data);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'whatsapp_instances');
    }
    setLoading(false);
  };

  const createInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstanceName) return;
    setCreating(true);

    try {
      const user = auth.currentUser;
      if (!user) return;

      await addDoc(collection(db, 'whatsapp_instances'), {
        user_id: user.uid,
        instance_name: newInstanceName,
        status: 'disconnected',
        phone_number: '',
        created_at: serverTimestamp()
      });

      setNewInstanceName('');
      loadInstances();
    } catch (e: any) {
      handleFirestoreError(e, OperationType.CREATE, 'whatsapp_instances');
      alert("Erro ao criar instância.");
    }
    setCreating(false);
  };

  const deleteInstance = async (id: string) => {
    try {
      await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: id })
      });
      await deleteDoc(doc(db, 'whatsapp_instances', id));
      loadInstances();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'whatsapp_instances');
    }
  };

  const connectInstance = async (id: string) => {
    setActiveQRInstance(id);
    setQrStatus('initializing');
    setQrCodeData(null);
    try {
      await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: id })
      });
    } catch (e) {
      console.error(e);
      alert('Falha ao iniciar conexão...');
    }
  };

  const disconnectInstance = async (id: string) => {
    try {
      await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: id })
      });
      await updateDoc(doc(db, 'whatsapp_instances', id), {
        status: 'disconnected'
      });
      loadInstances();
    } catch (e) {
       console.error(e);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-primary">Instâncias de WhatsApp</h1>
          <p className="text-[12px] text-secondary">Conecte seus números via leitor de QR Code multicontas.</p>
        </div>
      </div>

      <div className="bg-primary border border-subtle rounded-[12px] p-6 mb-8 flex flex-col">
        <h3 className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova Instância
        </h3>
        <form onSubmit={createInstance} className="flex gap-4">
          <input
            type="text"
            value={newInstanceName}
            onChange={(e) => setNewInstanceName(e.target.value)}
            placeholder="Nome (ex: Suporte Vendas)"
            className="flex-1 p-[12px] border border-subtle rounded-[8px] text-[14px] bg-secondary focus:outline-none focus:border-accent-primary"
          />
          <button 
            type="submit" 
            disabled={creating || !newInstanceName}
            className="bg-accent text-white px-5 py-2.5 rounded-[8px] font-[600] text-[14px] flex items-center gap-2 hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar Instância'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
        ) : instances.length === 0 ? (
          <div className="col-span-full py-12 text-center text-secondary border border-dashed border-subtle rounded-xl bg-primary">
            Nenhuma instância configurada. Crie a primeira acima.
          </div>
        ) : (
          instances.map((inst) => (
            <div key={inst.id} className="bg-primary border border-subtle rounded-[12px] p-6 flex flex-col relative overflow-hidden group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${inst.status === 'connected' ? 'bg-green-100 text-green-600' : 'bg-secondary text-secondary'}`}>
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-semibold text-primary">{inst.instance_name}</h4>
                    <span className="text-[12px] text-secondary mt-0.5 inline-block">
                      {inst.status === 'connected' ? 'Online' : 'Desconectado'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => deleteInstance(inst.id)}
                  className="p-2 text-secondary hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  title="Deletar Instância"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-auto pt-4 border-t border-subtle flex justify-between items-center">
                <div className="text-[12px] font-mono text-muted">ID: {inst.id.slice(0, 8)}</div>
                
                {inst.status === 'connected' ? (
                   <div className="flex gap-2">
                     <button 
                       onClick={async () => {
                         try {
                           const syncRes = await fetch(`/api/whatsapp/sync?instanceId=${inst.id}`);
                           const syncData = await syncRes.json();
                           if (syncData.groups || syncData.contacts) {
                              let total = 0;
                              for (const g of (syncData.groups || [])) {
                                 await setDoc(doc(db, 'whatsapp_contacts_groups', `${inst.id}_${g.id}`), {
                                   user_id: auth.currentUser?.uid,
                                   name: g.subject || 'Grupo Desconhecido',
                                   type: 'group',
                                   jid: g.id,
                                   participants_count: g.participants?.length || 0,
                                   updated_at: new Date()
                                 }, { merge: true });
                                 total++;
                              }
                              for (const c of (syncData.contacts || [])) {
                                 await setDoc(doc(db, 'whatsapp_contacts_groups', `${inst.id}_${c.id}`), {
                                   user_id: auth.currentUser?.uid,
                                   name: c.name || c.notify || c.verifiedName || c.id.split('@')[0],
                                   type: 'contact',
                                   jid: c.id,
                                   updated_at: new Date()
                                 }, { merge: true });
                                 total++;
                              }
                              alert(`Sincronizados ${total} contatos e grupos com sucesso!`);
                           } else {
                              alert('Nenhum dado recebido. Tente novamente em alguns segundos.');
                           }
                         } catch (e) {
                           console.error(e);
                           alert('Falha ao sincronizar: ' + e);
                         }
                       }}
                       className="flex items-center gap-2 text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100"
                     >
                       <RefreshCw className="w-4 h-4" /> Sincronizar
                     </button>
                     <button 
                       onClick={() => disconnectInstance(inst.id)}
                       className="flex items-center gap-2 text-sm font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded-md hover:bg-red-100"
                     >
                       Desconectar
                     </button>
                   </div>
                ) : (
                  <button 
                    onClick={() => connectInstance(inst.id)}
                    className="flex items-center gap-2 font-[600] text-[13px] bg-accent text-white px-4 py-2 rounded-[6px] hover:bg-accent-hover transition-colors"
                  >
                    <QrCode className="w-4 h-4" /> Conectar
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {activeQRInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-primary p-8 rounded-xl shadow-lg max-w-sm w-full mx-4 relative flex flex-col items-center">
            <button 
              onClick={() => setActiveQRInstance(null)}
              className="absolute top-4 right-4 p-2 text-secondary hover:text-primary rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-primary mb-2">Conectar WhatsApp</h3>
            <p className="text-secondary text-sm text-center mb-6">Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e escaneie o código abaixo.</p>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-subtle flex justify-center items-center w-64 h-64">
              {qrStatus === 'initializing' ? (
                <div className="flex flex-col items-center text-secondary">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <span className="text-sm">Iniciando Baileys...</span>
                </div>
              ) : qrCodeData ? (
                <QRCodeSVG value={qrCodeData} size={220} />
              ) : (
                <div className="flex flex-col items-center text-secondary">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  <span className="text-sm">Aguardando QR Code...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
