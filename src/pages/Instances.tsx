import { useEffect, useState, useRef } from 'react';
import { db, GLOBAL_USER_ID } from '../lib/firebase.js';
import {
  collection, query, where, addDoc, deleteDoc,
  doc, setDoc, serverTimestamp, orderBy, updateDoc, onSnapshot
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils.js';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, RefreshCw, LogOut, Trash2, Plus, Edit2, Check, X, QrCode } from 'lucide-react';

interface Instance {
  id: string;
  instance_name: string;
  status: string;
  phone_number?: string;
  wa_status?: string;
  wa_qr?: string;
}

export default function WhatsAppInstances() {
  const cachedInstances = localStorage.getItem('whatsapp_instances_list');
  const initialInstances = cachedInstances ? JSON.parse(cachedInstances) : [];

  const [instances, setInstances] = useState<Instance[]>(initialInstances);
  const [loading, setLoading] = useState(!cachedInstances);
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [connectingInstance, setConnectingInstance] = useState<string | null>(null);
  const [syncingInstance, setSyncingInstance] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Rename states
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [tempInstanceName, setTempInstanceName] = useState<string>('');

  // QR modal
  const [activeQRInstance, setActiveQRInstance] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>('initializing');

  // Firestore real-time listener for active QR instance
  const qrListenerRef = useRef<(() => void) | null>(null);

  const planLimit = 9999;
  const isLimitReached = instances.length >= planLimit;

  // Real-time listener for instance list
  useEffect(() => {
    const q = query(
      collection(db, 'whatsapp_instances'),
      where('user_id', '==', GLOBAL_USER_ID)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Instance));
      data.sort((a: any, b: any) => {
        const tA = a.created_at?.seconds || 0;
        const tB = b.created_at?.seconds || 0;
        return tB - tA;
      });
      setInstances(data);
      localStorage.setItem('whatsapp_instances_list', JSON.stringify(data));
      setLoading(false);
    }, (e) => {
      handleFirestoreError(e, OperationType.LIST, 'whatsapp_instances');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Poll for QR status of the active connecting instance
  useEffect(() => {
    let interval: any;
    if (!activeQRInstance) return;

    interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/status?instanceId=${activeQRInstance}`);
        if (!res.ok) return;
        const data = await res.json();
        const waStatus = data.status || 'disconnected';
        const waQr = data.qr || null;

        setQrStatus(waStatus);
        if (waQr) setQrData(waQr);

        if (waStatus === 'connected') {
          setActiveQRInstance(null);
          setQrData(null);
          setConnectingInstance(null);
          setSuccessMsg('✅ WhatsApp conectado com sucesso!');
          setTimeout(() => setSuccessMsg(null), 5000);

          // Update firestore status
          await updateDoc(doc(db, 'whatsapp_instances', activeQRInstance), {
            status: 'connected',
            wa_status: 'connected'
          }).catch(console.error);

          // Auto-sync contacts/groups after connecting
          try {
            const syncRes = await fetch(`/api/whatsapp/sync?instanceId=${activeQRInstance}`);
            const syncData = await syncRes.json();
            for (const g of (syncData.groups || [])) {
              await setDoc(doc(db, 'whatsapp_contacts_groups', `${activeQRInstance}_${g.id}`), {
                user_id: GLOBAL_USER_ID,
                name: g.subject || 'Grupo Desconhecido',
                type: 'group', jid: g.id,
                participants_count: g.participants?.length || 0,
                updated_at: new Date()
              }, { merge: true });
            }
            for (const c of (syncData.contacts || [])) {
              await setDoc(doc(db, 'whatsapp_contacts_groups', `${activeQRInstance}_${c.id}`), {
                user_id: GLOBAL_USER_ID,
                name: c.name || c.notify || c.verifiedName || c.id.split('@')[0],
                type: 'contact', jid: c.id,
                updated_at: new Date()
              }, { merge: true });
            }
          } catch (e) {
            console.error('Failed to sync after connect', e);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeQRInstance]);

  const createInstance = async () => {
    if (isLimitReached) {
      setErrorMsg(`Limite de ${planLimit} instância(s) atingido.`);
      return;
    }
    setCreatingInstance(true);
    setErrorMsg(null);
    try {
      await addDoc(collection(db, 'whatsapp_instances'), {
        user_id: GLOBAL_USER_ID,
        instance_name: `WhatsApp ${Date.now().toString().slice(-4)}`,
        status: 'disconnected',
        wa_status: 'disconnected',
        phone_number: '',
        created_at: serverTimestamp()
      });
      setSuccessMsg("Instância criada! Clique em 'Conectar' para escanear o QR Code.");
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e: any) {
      console.error("Erro ao criar instância:", e);
      let msg = 'Erro ao criar instância.';
      try {
        if (e && e.message) {
          const parsed = JSON.parse(e.message);
          msg = parsed.error || e.message;
        }
      } catch (_) {
        msg = e.message || String(e);
      }
      setErrorMsg(msg);
    } finally {
      setCreatingInstance(false);
    }
  };

  const deleteInstance = async (id: string) => {
    setErrorMsg(null);
    try {
      await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: id })
      });
      await deleteDoc(doc(db, 'whatsapp_instances', id));
    } catch (e: any) {
      console.error("Erro ao excluir instância:", e);
      setErrorMsg('Erro ao excluir instância: ' + (e.message || e));
    }
  };

  const connectInstance = async (id: string) => {
    setErrorMsg(null);
    setConnectingInstance(id);
    setActiveQRInstance(id);
    setQrStatus('initializing');
    setQrData(null);
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: id })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro HTTP! Status: ${res.status}`);
      }
      const data = await res.json();
      if (data && data.status === 'error') {
        throw new Error(data.error || 'Erro ao conectar');
      }
    } catch (e: any) {
      setErrorMsg('Falha ao iniciar conexão: ' + (e.message || e));
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
        status: 'disconnected',
        wa_status: 'disconnected'
      });
    } catch (e) {
      console.error(e);
    }
  };

  const syncContacts = async (id: string) => {
    setSyncingInstance(id);
    setErrorMsg(null);
    try {
      const syncRes = await fetch(`/api/whatsapp/sync?instanceId=${id}`);
      const syncData = await syncRes.json();
      if (syncData.error) throw new Error(syncData.error);
      let total = 0;
      for (const g of (syncData.groups || [])) {
        await setDoc(doc(db, 'whatsapp_contacts_groups', `${id}_${g.id}`), {
          user_id: GLOBAL_USER_ID,
          name: g.subject || 'Grupo Desconhecido',
          type: 'group', jid: g.id,
          participants_count: g.participants?.length || 0,
          updated_at: new Date()
        }, { merge: true });
        total++;
      }
      for (const c of (syncData.contacts || [])) {
        await setDoc(doc(db, 'whatsapp_contacts_groups', `${id}_${c.id}`), {
          user_id: GLOBAL_USER_ID,
          name: c.name || c.notify || c.verifiedName || c.id.split('@')[0],
          type: 'contact', jid: c.id,
          updated_at: new Date()
        }, { merge: true });
        total++;
      }
      setSuccessMsg(`Sincronizados ${total} contatos/grupos!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e: any) {
      setErrorMsg('Falha ao sincronizar: ' + (e.message || e));
    }
    setSyncingInstance(null);
  };

  const saveInstanceName = async (id: string) => {
    if (!tempInstanceName.trim()) return;
    try {
      await updateDoc(doc(db, 'whatsapp_instances', id), {
        instance_name: tempInstanceName.trim()
      });
      setEditingInstanceId(null);
    } catch (e: any) {
      console.error("Erro ao alterar nome da instância:", e);
      setErrorMsg("Erro ao alterar nome: " + (e.message || e));
    }
  };

  const isConnected = (inst: Instance) =>
    inst.status === 'open' || inst.status === 'connected' ||
    inst.wa_status === 'connected' || inst.wa_status === 'open';

  return (
    <div className="page-content">
      {/* Toasts */}
      {errorMsg && (
        <div className="toast toast-error" style={{ marginBottom: 16 }}>⚠️ {errorMsg}</div>
      )}
      {successMsg && (
        <div className="toast toast-success" style={{ marginBottom: 16 }}>{successMsg}</div>
      )}

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title">Meu WhatsApp</h1>
            <p className="page-subtitle">Gerencie suas conexões de WhatsApp para disparar campanhas.</p>
          </div>
          {!isLimitReached && (
            <button className="btn btn-primary" onClick={createInstance} disabled={creatingInstance}>
              {creatingInstance
                ? <><span className="spinner" style={{ borderTopColor: '#022c1a' }} /> Criando...</>
                : <><Plus size={16} /> Nova Instância</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Instances Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24 }}>
              <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 20, borderRadius: 6 }} />
              <div className="skeleton" style={{ height: 40, borderRadius: 10 }} />
            </div>
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ fontSize: 36 }}>📱</div>
          <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
            Nenhum WhatsApp conectado
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 380, marginBottom: 24 }}>
            Crie uma instância e escaneie o QR code para começar a disparar campanhas.
          </p>
          <button className="btn btn-primary" onClick={createInstance} disabled={creatingInstance}>
            {creatingInstance
              ? <><span className="spinner" style={{ borderTopColor: '#022c1a' }} /> Criando...</>
              : '+ Criar Primeira Instância'
            }
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {instances.map((instance) => {
            const connected = isConnected(instance);
            return (
              <div
                key={instance.id}
                style={{
                  background: 'var(--bg-card)',
                  border: connected ? '1px solid var(--border-green)' : '1px solid var(--border-subtle)',
                  borderRadius: 16,
                  padding: '24px 20px',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s'
                }}
              >
                {/* Color top bar */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: connected ? 'var(--green)' : 'var(--border-subtle)'
                }} />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: connected ? 'var(--green-glow)' : 'var(--bg-surface)',
                      border: connected ? '1px solid var(--border-green)' : '1px solid var(--border-subtle)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: connected ? 'var(--green)' : 'var(--text-secondary)',
                      flexShrink: 0
                    }}>
                      <Smartphone size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingInstanceId === instance.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <input
                            type="text"
                            value={tempInstanceName}
                            onChange={e => setTempInstanceName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveInstanceName(instance.id);
                              if (e.key === 'Escape') setEditingInstanceId(null);
                            }}
                            className="form-input"
                            style={{
                              fontSize: 13,
                              padding: '2px 8px',
                              height: 28,
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 6,
                              color: 'var(--text-primary)',
                              width: '100%',
                              maxWidth: 140
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => saveInstanceName(instance.id)}
                            style={{ background: 'none', border: 'none', padding: 4, color: 'var(--green)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Salvar"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingInstanceId(null)}
                            style={{ background: 'none', border: 'none', padding: 4, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <h3 style={{
                          fontFamily: 'Space Grotesk, sans-serif',
                          fontSize: 15,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          margin: '0 0 2px 0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {instance.instance_name || `WhatsApp ${instance.id.slice(-4)}`}
                        </h3>
                      )}
                      
                      {/* Status indicator under name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}>
                        <span style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: connected ? 'var(--green)' : '#cbd5e1',
                          display: 'inline-block',
                          boxShadow: connected ? '0 0 8px var(--green)' : 'none'
                        }} />
                        <span style={{ color: connected ? 'var(--green)' : 'var(--text-secondary)', fontWeight: 500 }}>
                          {connected ? 'Conectado' : 'Desconectado'}
                        </span>
                        {instance.phone_number && (
                          <span style={{ color: 'var(--text-muted)' }}>
                            • {instance.phone_number}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {editingInstanceId !== instance.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setEditingInstanceId(instance.id);
                          setTempInstanceName(instance.instance_name || '');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 6,
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 8,
                          transition: 'background 0.2s, color 0.2s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'var(--bg-surface)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'none';
                          e.currentTarget.style.color = 'var(--text-muted)';
                        }}
                        title="Editar nome"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => deleteInstance(instance.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 6,
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 8,
                          transition: 'background 0.2s, color 0.2s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                          e.currentTarget.style.color = '#f87171';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'none';
                          e.currentTarget.style.color = 'var(--text-muted)';
                        }}
                        title="Excluir instância"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div style={{
                  height: 1,
                  background: 'var(--border-subtle)',
                  margin: '20px 0 16px 0'
                }} />

                {/* Actions */}
                <div>
                  {connected ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => syncContacts(instance.id)}
                        disabled={syncingInstance === instance.id}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          height: 40,
                          borderRadius: 10
                        }}
                      >
                        {syncingInstance === instance.id ? <span className="spinner" /> : <RefreshCw size={12} />}
                        <span>Sincronizar</span>
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => disconnectInstance(instance.id)}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          height: 40,
                          borderRadius: 10
                        }}
                      >
                        <LogOut size={12} />
                        <span>Desconectar</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => connectInstance(instance.id)}
                      disabled={connectingInstance === instance.id}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '10px 16px',
                        borderRadius: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        color: 'var(--blue, #3b82f6)',
                        height: 40
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                      }}
                    >
                      {connectingInstance === instance.id ? (
                        <><span className="spinner" style={{ borderTopColor: 'var(--blue)' }} /> Gerando...</>
                      ) : (
                        <>
                          <QrCode size={14} />
                          <span>Gerar QR Code para Ligar</span>
                        </>
                      )}
                    </button>
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
          <div className="modal-content" style={{ padding: 32, textAlign: 'center', maxWidth: 420 }}>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
              Conectar WhatsApp
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
              Abra o WhatsApp → <strong>Dispositivos vinculados</strong> → Escanear QR code
            </p>

            {qrData ? (
              <div style={{ background: '#fff', padding: 16, borderRadius: 16, display: 'inline-block', margin: '0 auto 20px' }}>
                <QRCodeSVG value={qrData} size={220} />
              </div>
            ) : (
              <div style={{
                width: 220, height: 220, borderRadius: 16,
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 12, margin: '0 auto 20px'
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
                {qrStatus === 'connected' ? 'Conectado!' : 'Aguardando leitura...'}
              </span>
            </div>

            <button
              className="btn btn-secondary"
              onClick={() => { setActiveQRInstance(null); setQrData(null); setConnectingInstance(null); }}
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
