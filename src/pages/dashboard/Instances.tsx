import { useEffect, useState } from 'react';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, setDoc, serverTimestamp, orderBy, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { Smartphone, Plus, QrCode, Trash2, Loader2, RefreshCw, X, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Plan limits mock
  const planLimit = 1;
  const isLimitReached = instances.length >= planLimit;

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
            setSuccessMsg("WhatsApp conectado e sincronizado com sucesso!");
            setTimeout(() => setSuccessMsg(null), 5000);
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
    setErrorMsg(null);
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
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!newInstanceName) return;
    if (isLimitReached) {
       setErrorMsg(`Seu plano atual permite apenas ${planLimit} conta(s) de WhatsApp. Faça upgrade para adicionar mais.`);
       return;
    }
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
      setSuccessMsg("Instância criada! Clique em 'Conectar' para escanear o QR Code.");
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e: any) {
      handleFirestoreError(e, OperationType.CREATE, 'whatsapp_instances');
      setErrorMsg("Erro ao criar instância.");
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
    setErrorMsg(null);
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
      setErrorMsg('Falha ao iniciar conexão com servidor WhatsApp.');
      setActiveQRInstance(null);
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

  const syncContacts = async (id: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const syncRes = await fetch(`/api/whatsapp/sync?instanceId=${id}`);
      const syncData = await syncRes.json();
      if (syncData.groups || syncData.contacts) {
          let total = 0;
          for (const g of (syncData.groups || [])) {
              await setDoc(doc(db, 'whatsapp_contacts_groups', `${id}_${g.id}`), {
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
              await setDoc(doc(db, 'whatsapp_contacts_groups', `${id}_${c.id}`), {
                user_id: auth.currentUser?.uid,
                name: c.name || c.notify || c.verifiedName || c.id.split('@')[0],
                type: 'contact',
                jid: c.id,
                updated_at: new Date()
              }, { merge: true });
              total++;
          }
          setSuccessMsg(`Sincronizados ${total} contatos e grupos com sucesso!`);
          setTimeout(() => setSuccessMsg(null), 5000);
      } else {
          setErrorMsg('Nenhum dado recebido. Tente novamente.');
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Falha ao sincronizar: ' + e);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      
      {/* Toast Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-800 text-[13px] font-medium flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-4 h-4" />
            {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-100 text-green-800 text-[13px] font-medium flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4" />
            {successMsg}
        </div>
      )}

      {/* Creation form */}
      {!isLimitReached && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col shadow-sm w-full md:w-2/3 lg:w-1/2">
          <h3 className="text-[14px] font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" /> Adicionar WhatsApp
          </h3>
          <form onSubmit={createInstance} className="flex gap-3">
            <input
              type="text"
              value={newInstanceName}
              onChange={(e) => setNewInstanceName(e.target.value)}
              placeholder="Nome (ex: Suporte, Vendas)"
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
            />
            <button 
              type="submit" 
              disabled={creating || !newInstanceName}
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-bold text-[13px] flex items-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50 min-w-[120px] justify-center shadow-sm"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar Instância'}
            </button>
          </form>
          <p className="text-[12px] text-gray-500 mt-3">Você pode adicionar mais {planLimit - instances.length} conta(s) no seu plano atual.</p>
        </div>
      )}

      {isLimitReached && instances.length > 0 && (
         <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <p className="text-[13px] text-blue-800 font-medium">Você atingiu o limite de {planLimit} instâncias do seu plano atual. Realize o upgrade para adicionar mais números de WhatsApp.</p>
         </div>
      )}

      {/* Instances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
        {loading ? (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-gray-400">
             <Loader2 className="w-8 h-8 animate-spin mb-4" />
             <span className="text-[13px] font-medium">Carregando WhatsApps...</span>
          </div>
        ) : instances.length === 0 ? (
          <div className="col-span-full py-20 text-center flex flex-col items-center border border-dashed border-gray-300 rounded-2xl bg-gray-50">
            <Smartphone className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-[16px] font-bold text-gray-900 mb-1">Nenhum WhatsApp conectado</h3>
            <p className="text-[14px] text-gray-500 max-w-sm">Adicione uma instância acima para gerar o QR Code e começar a disparar suas campanhas.</p>
          </div>
        ) : (
          instances.map((inst) => (
            <div key={inst.id} className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col relative overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${inst.status === 'connected' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-bold text-gray-900">{inst.instance_name}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className={`w-2 h-2 rounded-full ${inst.status === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      <span className="text-[12px] text-gray-500 font-medium tracking-wide">
                        {inst.status === 'connected' ? 'Conectado' : 'Desconectado'}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => deleteInstance(inst.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remover Instância"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {inst.status === 'connected' && (
                <div className="grid grid-cols-2 gap-4 mb-6 pt-4 border-t border-gray-100">
                   <div className="flex flex-col">
                     <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Status Sinc.</span>
                     <span className="text-[13px] font-medium text-gray-900">Atualizado</span>
                   </div>
                   <div className="flex flex-col">
                     <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Gatilhos</span>
                     <span className="text-[13px] font-medium flex items-center gap-1 text-gray-900">
                       <MessageSquare className="w-3 h-3 text-gray-400"/> Ativos
                     </span>
                   </div>
                </div>
              )}

              <div className="mt-auto flex py-2 pt-4 border-t border-gray-100">
                {inst.status === 'connected' ? (
                   <div className="flex gap-2 w-full">
                     <button 
                       onClick={() => syncContacts(inst.id)}
                       className="flex-1 flex justify-center items-center gap-2 py-2 text-[13px] border border-gray-200 font-medium text-gray-700 bg-white rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                       title="Sincronizar Contatos e Grupos"
                     >
                       <RefreshCw className="w-4 h-4" /> Sincronizar
                     </button>
                     <button 
                       onClick={() => disconnectInstance(inst.id)}
                       className="flex justify-center items-center py-2 px-4 border border-red-200 text-[13px] font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                       title="Desconectar"
                     >
                       <X className="w-4 h-4" />
                     </button>
                   </div>
                ) : (
                  <button 
                    onClick={() => connectInstance(inst.id)}
                    className="w-full flex items-center justify-center gap-2 font-bold text-[13px] bg-indigo-50 text-indigo-700 border border-indigo-100 py-2.5 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm"
                  >
                    <QrCode className="w-4 h-4" /> Gerar QR Code para Ligar
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* QR Code Modal */}
      {activeQRInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full relative flex flex-col items-center animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setActiveQRInstance(null)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
               <QrCode className="w-6 h-6 text-indigo-600" />
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">Conectar WhatsApp</h3>
            <p className="text-gray-500 text-sm text-center mb-8 px-4">Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e escaneie o código abaixo.</p>
            
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex justify-center items-center w-64 h-64 mb-4">
              {qrStatus === 'initializing' ? (
                <div className="flex flex-col items-center text-gray-500 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <span className="text-sm font-medium">Iniciando conexão...</span>
                </div>
              ) : qrCodeData ? (
                <QRCodeSVG value={qrCodeData} size={224} />
              ) : (
                <div className="flex flex-col items-center text-gray-500 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <span className="text-sm font-medium">Aguardando QR Code...</span>
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-3 rounded-lg flex items-center justify-center gap-2 w-full border border-gray-100">
               <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
               <span className="text-[12px] font-medium text-gray-600">Aguardando leitura...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
