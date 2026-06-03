import { useEffect, useState } from 'react';
import { auth, db, GLOBAL_USER_ID } from '../lib/firebase.js';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, setDoc, serverTimestamp, orderBy, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils.js';
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

  // New UI loading states
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [connectingInstance, setConnectingInstance] = useState<string | null>(null);
  const [syncingInstance, setSyncingInstance] = useState<string | null>(null);

  // Plan limits
  const planLimit = 9999;
  const isLimitReached = instances.length >= planLimit;

  // QR code modal state
  const [activeQRInstance, setActiveQRInstance] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>('');

  useEffect(() => {
    loadInstances();
  }, []);

  // Polling for QR / connected status
  useEffect(() => {
    let interval: any;
    if (activeQRInstance) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/whatsapp/status?instanceId=${activeQRInstance}&t=${Date.now()}`);
          const data = await res.json();
          setQrStatus(data.status);
          if (data.qr) {
            setQrCodeData(data.qr);
          }
          if (data.status === 'connected') {
            setActiveQRInstance(null);
            setQrCodeData(null);
            setConnectingInstance(null);
            await updateDoc(doc(db, 'whatsapp_instances', activeQRInstance), {
              status: 'connected'
            });
            try {
              const syncRes = await fetch(`/api/whatsapp/sync?instanceId=${activeQRInstance}`);
              const syncData = await syncRes.json();
              if (syncData.groups || syncData.contacts) {
                for (const g of (syncData.groups || [])) {
                  await setDoc(doc(db, 'whatsapp_contacts_groups', `${activeQRInstance}_${g.id}`), {
                    user_id: GLOBAL_USER_ID,
                    name: g.subject || 'Grupo Desconhecido',
                    type: 'group',
                    jid: g.id,
                    participants_count: g.participants?.length || 0,
                    updated_at: new Date()
                  }, { merge: true });
                }
                for (const c of (syncData.contacts || [])) {
                  await setDoc(doc(db, 'whatsapp_contacts_groups', `${activeQRInstance}_${c.id}`), {
                    user_id: GLOBAL_USER_ID,
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
            setSuccessMsg('WhatsApp conectado e sincronizado com sucesso!');
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
      const q = query(
        collection(db, 'whatsapp_instances'),
        where('user_id', '==', GLOBAL_USER_ID),
        orderBy('created_at', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Instance));
      setInstances(data);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'whatsapp_instances');
    }
    setLoading(false);
  };

  // Adapted to work both from a form submit and a button click
  const createInstance = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // When called from the quick-create button (no name dialog), use a default name
    const instanceName = newInstanceName || `WhatsApp ${Date.now().toString().slice(-4)}`;

    if (isLimitReached) {
      setErrorMsg(`Seu plano atual permite apenas ${planLimit} conta(s) de WhatsApp. Faça upgrade para adicionar mais.`);
      return;
    }

    setCreating(true);
    setCreatingInstance(true);

    try {
      await addDoc(collection(db, 'whatsapp_instances'), {
        user_id: GLOBAL_USER_ID,
        instance_name: instanceName,
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
      setErrorMsg('Erro ao criar instância.');
    }

    setCreating(false);
    setCreatingInstance(false);
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
    setConnectingInstance(id);
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
      setConnectingInstance(null);
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
    setSyncingInstance(id);
    try {
      const syncRes = await fetch(`/api/whatsapp/sync?instanceId=${id}`);
      const syncData = await syncRes.json();
      if (syncData.groups || syncData.contacts) {
        let total = 0;
        for (const g of (syncData.groups || [])) {
          await setDoc(doc(db, 'whatsapp_contacts_groups', `${id}_${g.id}`), {
            user_id: GLOBAL_USER_ID,
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
            user_id: GLOBAL_USER_ID,
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
    setSyncingInstance(null);
  };

  return (
    <div className="page-content">
      {/* Toast notifications */}
      {errorMsg && (
        <div className="toast toast-error" style={{ marginBottom: 16 }}>
          ⚠️ {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="toast toast-success" style={{ marginBottom: 16 }}>
          ✅ {successMsg}
        </div>
      )}

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title">Meu WhatsApp</h1>
            <p className="page-subtitle">Gerencie suas conexões de WhatsApp para disparar campanhas.</p>
          </div>
          {!isLimitReached && (
            <button
              className="btn btn-primary"
              onClick={() => createInstance()}
              disabled={creatingInstance}
            >
              {creatingInstance
                ? <><span className="spinner" style={{ borderTopColor: '#022c1a' }} /> Criando...</>
                : <>+ Nova Instância</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Plan limit banner */}
      {isLimitReached && instances.length > 0 && (
        <div className="glass-card" style={{
          padding: '12px 20px',
          borderColor: 'var(--border-yellow)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8
        }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Você atingiu o limite de <strong style={{ color: 'var(--text-primary)' }}>{planLimit}</strong> instância(s) do seu plano.{' '}
            <span style={{ color: 'var(--yellow)', cursor: 'pointer', fontWeight: 600 }}>Fazer upgrade →</span>
          </p>
        </div>
      )}

      {/* Instances Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[1, 2].map(i => (
            <div key={i} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 16,
              padding: 24
            }}>
              <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 20, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 40, borderRadius: 10 }} />
            </div>
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ fontSize: 36 }}>📱</div>
          <h3 style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontSize: 18,
            fontWeight: 700,
            marginBottom: 8,
            color: 'var(--text-primary)'
          }}>
            Nenhum WhatsApp conectado
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 380, marginBottom: 24 }}>
            Crie uma instância e escaneie o QR code para começar a disparar campanhas.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => createInstance()}
            disabled={creatingInstance}
          >
            {creatingInstance
              ? <><span className="spinner" style={{ borderTopColor: '#022c1a' }} /> Criando...</>
              : <>+ Criar Primeira Instância</>
            }
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {instances.map((instance: Instance) => {
            const isConnected = instance.status === 'open' || instance.status === 'connected';
            return (
              <div
                key={instance.id}
                style={{
                  background: 'var(--bg-card)',
                  border: isConnected ? '1px solid var(--border-green)' : '1px solid var(--border-subtle)',
                  borderRadius: 16,
                  padding: 24,
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s'
                }}
              >
                {/* Status top bar */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: isConnected ? 'var(--green)' : 'var(--border-subtle)'
                }} />

                {/* Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: isConnected ? 'var(--green-glow)' : 'var(--bg-surface)',
                      border: isConnected ? '1px solid var(--border-green)' : '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22
                    }}>
                      📱
                    </div>
                    <div>
                      <h3 style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontSize: 15,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: 2
                      }}>
                        {instance.instance_name || `WhatsApp ${instance.id.slice(-4)}`}
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {instance.phone_number || 'Número não configurado'}
                      </p>
                    </div>
                  </div>

                  {isConnected ? (
                    <div className="badge badge-green" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="pulse-dot" style={{ width: 6, height: 6 }} />
                      Ativo
                    </div>
                  ) : (
                    <div className="badge badge-gray">Offline</div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isConnected ? (
                    <>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => syncContacts(instance.id)}
                        disabled={syncingInstance === instance.id}
                        style={{ flex: 1 }}
                      >
                        {syncingInstance === instance.id
                          ? <span className="spinner" />
                          : '🔄'
                        } Sincronizar
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => disconnectInstance(instance.id)}
                        style={{ flex: 1 }}
                      >
                        ✕ Desconectar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-primary"
                        onClick={() => connectInstance(instance.id)}
                        disabled={connectingInstance === instance.id}
                        style={{ flex: 1 }}
                      >
                        {connectingInstance === instance.id
                          ? <><span className="spinner" style={{ borderTopColor: '#022c1a' }} /> Conectando...</>
                          : '📲 Conectar'
                        }
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteInstance(instance.id)}
                        title="Excluir instância"
                        style={{ aspectRatio: '1', padding: '0 12px' }}
                      >
                        🗑️
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR Code Modal */}
      {activeQRInstance && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ padding: 32, textAlign: 'center', maxWidth: 400 }}>
            <h2 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 8,
              color: 'var(--text-primary)'
            }}>
              Conectar WhatsApp
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
              Abra o WhatsApp → Dispositivos vinculados → Escanear QR code
            </p>

            {qrCodeData ? (
              <div style={{
                background: '#fff',
                padding: 16,
                borderRadius: 16,
                display: 'inline-block',
                margin: '0 auto 20px'
              }}>
                <QRCodeSVG value={qrCodeData} size={220} />
              </div>
            ) : (
              <div style={{
                width: 220,
                height: 220,
                borderRadius: 16,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                margin: '0 auto 20px'
              }}>
                <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3, borderTopColor: 'var(--green)' }} />
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {qrStatus === 'initializing' ? 'Iniciando conexão...' : 'Aguardando QR code...'}
                </p>
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              O QR code expira em alguns segundos. Escaneie rapidamente.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
              <div className="pulse-dot" style={{ width: 8, height: 8 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Aguardando leitura...
              </span>
            </div>

            <button
              className="btn btn-secondary"
              onClick={() => {
                setActiveQRInstance(null);
                setQrCodeData(null);
                setConnectingInstance(null);
              }}
              style={{ width: '100%' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
