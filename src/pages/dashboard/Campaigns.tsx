import { useState, useEffect } from 'react';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, onSnapshot, serverTimestamp, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import PhonePreview from '../../components/PhonePreview';
import { Send, Bot, Loader2, Sparkles, Image as ImageIcon, Plus, Trash2, Calendar, Megaphone, Edit2, Clock, CheckCircle2, AlertCircle, Play, Pause, ChevronDown, ChevronUp } from 'lucide-react';

export default function Campaigns() {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [campaignsList, setCampaignsList] = useState<any[]>([]);

  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  
  const [isAiSectionOpen, setIsAiSectionOpen] = useState(true);
  
  const [instances, setInstances] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  
  const [selectedInstance, setSelectedInstance] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [campaignName, setCampaignName] = useState('Promoção Relâmpago...');

  // Scheduling State
  const [triggerType, setTriggerType] = useState<'manual' | 'scheduled' | 'auto'>('manual');
  const [autoSendNow, setAutoSendNow] = useState(false);
  const [sendInterval, setSendInterval] = useState('00:00');
  const [isRecurring, setIsRecurring] = useState(false);
  const [scheduledDays, setScheduledDays] = useState<number[]>([]); // 0-6
  const [scheduledTimes, setScheduledTimes] = useState<string[]>(['09:00']);
  const [scheduledDates, setScheduledDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState('');

  // ML / Products State
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [useAllProducts, setUseAllProducts] = useState(false);
  const [showVariableMenu, setShowVariableMenu] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 6000);
  };
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const DAYS = [
    { label: 'Dom', value: 0 },
    { label: 'Seg', value: 1 },
    { label: 'Ter', value: 2 },
    { label: 'Qua', value: 3 },
    { label: 'Qui', value: 4 },
    { label: 'Sex', value: 5 },
    { label: 'Sáb', value: 6 },
  ];

  useEffect(() => {
    if (!selectedInstance) return;
    
    // Auto-fetch groups for the dropdown
    fetch(`/api/whatsapp/sync?instanceId=${selectedInstance}`)
      .then(res => res.json())
      .then(syncData => {
         const transientGroups: any[] = [];
         for (const g of (syncData.groups || [])) {
             transientGroups.push({ id: selectedInstance + '_' + g.id, name: g.subject || g.name || 'Grupo', type: 'group' });
         }
         for (const c of (syncData.contacts || [])) {
             transientGroups.push({ id: selectedInstance + '_' + c.id, name: c.name || c.notify || c.verifiedName || c.pushname || c.id?.split('@')[0] || 'Contato', type: 'contact' });
         }
         setGroups(prev => {
             const map = new Map(prev.map(p => [p.id, p]));
             transientGroups.forEach(tg => map.set(tg.id, tg));
             return Array.from(map.values());
         });
      })
      .catch(console.error);
  }, [selectedInstance]);

  // AI Prompt details
  const [productUrl, setProductUrl] = useState('');
  const [aiObjective, setAiObjective] = useState('vender_produto');
  const [aiTone, setAiTone] = useState('persuasivo');
  const [aiVariations, setAiVariations] = useState<{title: string, text: string}[] | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // Load instances
    getDocs(query(collection(db, 'whatsapp_instances'), where('user_id', '==', user.uid)))
      .then(res => {
        setInstances(res.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .catch(e => {
        handleFirestoreError(e, OperationType.LIST, 'whatsapp_instances');
      });

    // Realtime listener for groups/contacts
    const qGroups = query(collection(db, 'whatsapp_contacts_groups'), where('user_id', '==', user.uid));
    const unsubscribeGroups = onSnapshot(qGroups, (snapshot: any) => {
      setGroups(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }, (e: any) => {
      handleFirestoreError(e, OperationType.LIST, 'whatsapp_contacts_groups');
    });

    // Realtime listener for campaigns
    const qCampaigns = query(collection(db, 'campaigns'), where('user_id', '==', user.uid));
    const unsubscribeCampaigns = onSnapshot(qCampaigns, (snapshot: any) => {
      const camps = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      camps.sort((a: any, b: any) => {
        const timeA = a.created_at?.toMillis?.() || 0;
        const timeB = b.created_at?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setCampaignsList(camps);
    }, (e: any) => {
      console.error('Snapshot error for campaigns:', e);
      handleFirestoreError(e, OperationType.LIST, 'campaigns');
    });

    // Load products
    getDocs(query(collection(db, 'affiliate_products'), where('user_id', '==', user.uid)))
      .then(res => {
        setProducts(res.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .catch(e => console.error("Error loading products", e));

    return () => {
      unsubscribeGroups();
      unsubscribeCampaigns();
    };
  }, []);

  const generateCopy = async () => {
    setGenerating(true);
    setAiVariations(null);
    try {
      const payload: any = {
        productUrl,
        aiObjective,
        aiTone,
        campaignName
      };

      const resp = await fetch("/api/generate-copy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({ error: 'Invalid response from server' }));

      if (resp.ok && data.variations) {
        setAiVariations(data.variations);
      } else if (resp.ok && data.text) {
        setMessage(data.text);
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error(error);
      showError(error.message || 'Erro ao gerar copy. Verifique erro no console.');
    }
    setGenerating(false);
  };

  const handleSend = async () => {
    if (!selectedInstance || !selectedGroup || !message || !campaignName) {
      showError("Preencha todos os campos obrigatórios (Instância, Grupo, Nome e Mensagem)");
      return;
    }
    
    if (autoSendNow) {
      const match = sendInterval.match(/^(\d{2,3}):([0-5]\d)$/);
      if (!match) {
        showError("O intervalo deve estar no formato MM:SS, entre 00:00 e 999:59 e segundos não podem passar de 59.");
        return;
      }
      const m = parseInt(match[1]);
      const s = parseInt(match[2]);
      if (m === 0 && s === 0) {
         showError("O intervalo para envio automático não pode ser zero.");
         return;
      }
    }

    try {
      // Check if instance is connected
      const statusRes = await fetch(`/api/whatsapp/status?instanceId=${selectedInstance}`);
      if (statusRes.ok) {
         const statusData = await statusRes.json();
         if (statusData.status !== 'connected') {
             showError('A Instância de WhatsApp selecionada não está conectada. Por favor, acesse a aba "Instâncias" e conecte via QR Code antes de salvar/enviar.');
             return;
         }
      }
    } catch (e) {
      // ignore network errors for this pre-check
    }

    setSending(true);
    
    const user = auth.currentUser;
    if (!user) return;

    try {
        const payload: any = {
          name: campaignName,
          instance_id: selectedInstance,
          target_group_id: selectedGroup,
          message,
          image_url: imageUrl || '',
          use_ml_products: useAllProducts || selectedProductIds.length > 0,
          ml_product_ids: useAllProducts ? 'ALL' : selectedProductIds,
          updated_at: serverTimestamp(),
          trigger_type: autoSendNow ? 'auto' : triggerType,
          auto_send_now: autoSendNow,
          send_interval: autoSendNow ? sendInterval : null,
          is_recurring: isRecurring,
          scheduled_days: scheduledDays,
          scheduled_times: scheduledTimes,
          scheduled_dates: scheduledDates,
        };

        if (triggerType === 'scheduled' || autoSendNow) {
          payload.status = 'scheduled';
        }

        if (editingId) {
          await updateDoc(doc(db, 'campaigns', editingId), payload);
        } else {
          const user = auth.currentUser;
          if (!user) throw new Error("Usuário não autenticado");
          
          await addDoc(collection(db, 'campaigns'), {
            user_id: user.uid,
            created_at: serverTimestamp(),
            status: 'draft',
            ...payload,
          });
        }
        
        setTimeout(() => {
          setSending(false);
          setMessage('');
          setImageUrl('');
          setProductUrl('');
          setCampaignName('Promoção Relâmpago...');
          setIsCreating(false);
          setEditingId(null);
          setTriggerType('manual');
          setAutoSendNow(false);
          setSendInterval('00:00');
          setIsRecurring(false);
          setScheduledDays([]);
          setScheduledTimes(['09:00']);
          setScheduledDates([]);
        }, 500);
    } catch(err: any) {
      console.error("Erro ao disparar campanha", err);
      showError(err.message || 'Erro ao salvar campanha');
      setSending(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    // Removed window.confirm because it is blocked in the iframe
    try {
       await deleteDoc(doc(db, 'campaigns', id));
    } catch (e: any) {
       handleFirestoreError(e, OperationType.DELETE, 'campaigns');
    }
  }

  const handleTogglePause = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'paused' ? 'scheduled' : 'paused';
      await updateDoc(doc(db, 'campaigns', id), {
        status: newStatus,
        updated_at: serverTimestamp()
      });
    } catch (e: any) {
      handleFirestoreError(e, OperationType.UPDATE, 'campaigns');
    }
  }

  const handleEditCampaign = (camp: any) => {
    setEditingId(camp.id);
    setCampaignName(camp.name || '');
    setSelectedInstance(camp.instance_id || '');
    setSelectedGroup(camp.target_group_id || '');
    setMessage(camp.message || '');
    setImageUrl(camp.image_url || '');
    setTriggerType(camp.trigger_type === 'auto' ? 'manual' : (camp.trigger_type || 'manual'));
    setAutoSendNow(camp.auto_send_now || camp.trigger_type === 'auto' || false);
    setSendInterval(camp.send_interval || '00:00');
    setIsRecurring(camp.is_recurring || false);
    setScheduledDays(camp.scheduled_days || []);
    setScheduledTimes(camp.scheduled_times || ['09:00']);
    setScheduledDates(camp.scheduled_dates || []);
    
    // Set ML Products
    setUseAllProducts(camp.ml_product_ids === 'ALL' || camp.use_ml_products === true);
    if (camp.ml_product_ids && Array.isArray(camp.ml_product_ids)) {
       setSelectedProductIds(camp.ml_product_ids);
       setUseAllProducts(false);
    } else {
       setSelectedProductIds([]);
    }
    
    setIsCreating(true);
  };

  const handleTriggerCampaign = async (id: string, camp: any) => {
    try {
      // Check if instance is actually connected on the backend
      const statusRes = await fetch(`/api/whatsapp/status?instanceId=${camp.instance_id}`);
      if (statusRes.ok) {
         const statusData = await statusRes.json();
         if (statusData.status !== 'connected') {
             showError('A Instância de WhatsApp selecionada não está conectada. Por favor, acesse a aba "Instâncias" e faça o login via QR Code antes de disparar.');
             return;
         }
      }

      await updateDoc(doc(db, 'campaigns', id), {
        status: 'sending',
        updated_at: serverTimestamp()
      });
      
      const jid = camp.target_group_id.replace(`${camp.instance_id}_`, '');
      let messageText = camp.message || '';
      let finalImageUrl = camp.image_url || '';

      if (camp.use_ml_products && (messageText.includes('{') || finalImageUrl.includes('{product_image}'))) {
         let matchedProduct = products.length > 0 ? products[0] : null;
         if (camp.ml_product_ids && camp.ml_product_ids !== 'ALL') {
             const allowed = products.filter(p => camp.ml_product_ids.includes(p.id));
             if (allowed.length > 0) matchedProduct = allowed[0];
         }
         if (matchedProduct) {
             const prod = matchedProduct;
             
             const replaceOrRemoveLine = (text: string, placeholder: string, value: string) => {
                 if (!value) {
                     return text.split('\n').filter(line => !line.includes(placeholder)).join('\n');
                 }
                 return text.replace(new RegExp(placeholder, 'g'), value);
             };

             messageText = replaceOrRemoveLine(messageText, '{product_title}', prod.product_title || '');
             messageText = replaceOrRemoveLine(messageText, '{product_price}', prod.product_price ? `R$ ${Number(prod.product_price).toFixed(2).replace('.', ',')}` : '');
             messageText = replaceOrRemoveLine(messageText, '{product_old_price}', prod.product_old_price ? `~R$ ${Number(prod.product_old_price).toFixed(2).replace('.', ',')}~` : '');
             messageText = replaceOrRemoveLine(messageText, '{product_discount}', prod.product_discount || '');
             
             const linkToUse = prod.product_affiliate_link || prod.product_link || '';
             messageText = replaceOrRemoveLine(messageText, '{product_affiliate_link}', linkToUse);
             messageText = replaceOrRemoveLine(messageText, '{product_link}', linkToUse);
             
             messageText = replaceOrRemoveLine(messageText, '{product_image}', prod.product_image || '');
            
             // Clean up any remaining empty variables
             const lines = messageText.split('\n');
             messageText = lines.filter((l: string) => !/{[a-zA-Z0-9_]+}/.test(l)).join('\n');
             
             if (finalImageUrl.includes('{product_image}')) {
                 finalImageUrl = finalImageUrl.replace(/{product_image}/g, prod.product_image || '');
             } else if (!finalImageUrl && messageText.includes('{product_image}')) {
                 finalImageUrl = prod.product_image || '';
             }
         }
      }

      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: camp.instance_id,
          to: jid,
          message: messageText,
          image_url: finalImageUrl
        })
      });

      if (!res.ok) {
         let errorMsg = 'Erro ao enviar mensagem';
         try {
           const errData = await res.json();
           errorMsg = errData.error || errorMsg;
         } catch (e) { /* ignore parse error */ }
         throw new Error(errorMsg);
      }

      showSuccess('Campanha disparada com sucesso!');
      await updateDoc(doc(db, 'campaigns', id), {
        status: (camp.is_recurring || camp.trigger_type === 'auto') ? 'scheduled' : 'sent',
        last_run: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    } catch (e: any) {
      console.error(e);
      showError('Falha ao disparar campanha: ' + e.message);
      try {
        await updateDoc(doc(db, 'campaigns', id), {
            status: 'failed',
            updated_at: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'campaigns');
      }
    }
  };

  if (!isCreating) {
    return (
      <div className="flex-1 flex flex-col h-full bg-secondary">
        <header className="h-[72px] border-b border-subtle bg-primary flex items-center justify-between px-8 shrink-0">
          <div>
            <h1 className="text-[18px] font-bold text-primary">Campanhas</h1>
            <p className="text-[12px] text-secondary">Gerencie suas campanhas e disparos</p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-accent text-white px-5 py-2.5 rounded-lg font-semibold text-[14px] flex items-center gap-2 hover:bg-accent-hover transition-colors"
          >
            <Plus className="w-4 h-4" /> Nova Campanha
          </button>
        </header>

        <div className="p-8 flex-1 overflow-y-auto">
          {campaignsList.length === 0 ? (
            <div className="text-center py-20">
              <Megaphone className="w-12 h-12 text-secondary opacity-50 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-primary mb-2">Nenhuma campanha criada</h3>
              <p className="text-sm text-secondary">Crie sua primeira campanha para iniciar seus disparos.</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-4xl">
              {campaignsList.map(camp => (
                <div key={camp.id} className="bg-primary border border-subtle rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                        <Send className="w-5 h-5" />
                     </div>
                     <div>
                       <h3 className="text-[15px] font-semibold text-primary">{camp.name}</h3>
            <div className="flex items-center gap-3 text-[12px] text-secondary mt-1">
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {camp.created_at?.toDate()?.toLocaleDateString()}</span>
              <span>•</span>
              {camp.trigger_type === 'scheduled' && (
                <>
                  <span className="flex items-center gap-1 text-accent"><Clock className="w-3 h-3"/> Programado</span>
                  <span>•</span>
                </>
              )}
              {camp.trigger_type === 'auto' && (
                <>
                  <span className="flex items-center gap-1 text-green-500"><Sparkles className="w-3 h-3"/> Contínuo</span>
                  <span>•</span>
                </>
              )}
              <span className={`font-medium ${camp.status === 'sent' ? 'text-green-500' : camp.status === 'failed' ? 'text-red-500' : camp.status === 'paused' ? 'text-orange-500' : 'text-blue-500'}`}>
                  {camp.status === 'sending' ? 'Enviando...' : (camp.status === 'sent' ? 'Enviada' : (camp.status === 'scheduled' ? 'Ativa' : (camp.status === 'paused' ? 'Pausada' : camp.status)))}
              </span>
            </div>
            {camp.trigger_type === 'scheduled' && (
              <div className="mt-1 text-[11px] text-accent/80 flex flex-wrap gap-x-2 gap-y-1">
                 {camp.scheduled_days?.length > 0 && <span className="bg-accent/5 px-1.5 py-0.5 rounded border border-accent/10">Dias: {camp.scheduled_days.map((d: number) => DAYS.find(day => day.value === d)?.label).join(', ')}</span>}
                 {camp.scheduled_dates?.length > 0 && <span className="bg-accent/5 px-1.5 py-0.5 rounded border border-accent/10">{camp.scheduled_dates.length} data(s) fixa(s)</span>}
                 <span className="bg-accent/5 px-1.5 py-0.5 rounded border border-accent/10">às {camp.scheduled_times?.join(', ')}</span>
              </div>
            )}
            {camp.trigger_type === 'auto' && (
              <div className="mt-1 text-[11px] text-green-600 flex flex-wrap gap-x-2 gap-y-1">
                 <span className="bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">A cada {camp.send_interval || '00:00'} (MM:SS)</span>
              </div>
            )}
                     </div>
                  </div>
                  <div className="flex items-center gap-3">
                     {camp.trigger_type === 'auto' && (
                       <button
                         onClick={() => handleTogglePause(camp.id, camp.status)}
                         className={`p-2 rounded-lg transition-colors ${camp.status === 'paused' ? 'text-green-500 hover:bg-green-50' : 'text-orange-500 hover:bg-orange-50'}`}
                         title={camp.status === 'paused' ? 'Retomar Disparos' : 'Pausar Disparos'}
                       >
                         {camp.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                       </button>
                     )}
                     <button 
                       onClick={() => handleTriggerCampaign(camp.id, camp)} 
                       disabled={camp.status === 'sending'}
                       className="px-4 py-2 bg-accent text-white rounded-lg text-[13px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
                     >
                       {camp.status === 'sending' ? (
                         <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</span>
                       ) : 'Disparar'}
                     </button>
                     <button onClick={() => handleEditCampaign(camp)} className="p-2 text-secondary hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                     </button>
                     <button onClick={() => handleDeleteCampaign(camp.id)} className="p-2 text-secondary hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Toasts */}
        {(errorMsg || successMsg) && (
          <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
            {errorMsg && (
              <div className="bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 max-w-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-[14px] font-medium leading-snug">{errorMsg}</p>
              </div>
            )}
            {successMsg && (
              <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 max-w-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <p className="text-[14px] font-medium leading-snug">{successMsg}</p>
              </div>
            )}
          </div>
        )}

      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-secondary">
      {/* Header */}
      <header className="h-[72px] border-b border-subtle bg-primary flex items-center justify-between px-8 shrink-0">
        <div>
          <h1 className="text-[18px] font-bold text-primary">{editingId ? 'Editar Campanha' : 'Nova Campanha'}</h1>
          <p className="text-[12px] text-secondary">Configure o disparo inteligente via Gemini IA</p>
        </div>
            <div className="flex gap-3">
              <button onClick={() => {
                setIsCreating(false);
                setEditingId(null);
                setMessage('');
                setImageUrl('');
                setProductUrl('');
                setCampaignName('Promoção Relâmpago...');
                setTriggerType('manual');
                setAutoSendNow(false);
                setSendInterval('00:00');
                setIsRecurring(false);
                setScheduledDays([]);
                setScheduledTimes(['09:00']);
              }} className="px-5 py-2.5 border border-subtle bg-transparent rounded-lg font-semibold text-[14px] text-primary hover:bg-secondary transition-colors">
                Cancelar
              </button>
          <button 
            onClick={handleSend}
            disabled={sending}
            className="bg-accent text-white px-5 py-2.5 rounded-lg font-semibold text-[14px] flex items-center gap-2 hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Campanha'}
          </button>
        </div>
      </header>

      {/* Content Area */}
      <div className="p-8 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
        {/* Configure Builder */}
        <div className="bg-primary border border-subtle rounded-xl p-6 flex flex-col">
          {/* Agendamento Configuration */}
          <div className="mb-6 p-4 bg-secondary/50 border border-subtle rounded-xl">
             <div className="flex items-center justify-between mb-4">
               <div>
                  <h3 className="text-[14px] font-bold text-primary flex items-center gap-2">
                    <Clock className="w-4 h-4 text-accent" /> Configuração de Disparo
                  </h3>
                  <p className="text-[11px] text-secondary mt-0.5">Defina quando e como sua campanha será enviada</p>
               </div>
               <div className="flex items-center gap-3">
                 <label className="flex items-center cursor-pointer group">
                   <span className="text-[13px] font-semibold text-secondary mr-3 group-hover:text-primary transition-colors">Disparo Contínuo</span>
                   <div className="relative">
                     <input type="checkbox" className="sr-only" checked={autoSendNow} onChange={(e) => setAutoSendNow(e.target.checked)} />
                     <div className={`block w-[42px] h-[24px] outline-none rounded-full transition-colors duration-200 ${autoSendNow ? 'bg-[#00a884]' : 'bg-gray-300'}`}></div>
                     <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow-sm ${autoSendNow ? 'translate-x-[18px]' : 'translate-x-0'}`}></div>
                   </div>
                 </label>
               </div>
             </div>

             {autoSendNow ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-t border-subtle/50 pt-3">
                  <div>
                     <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-2">Intervalo de Envio (MM:SS)</label>
                     <div className="flex items-center gap-2">
                        <input 
                          type="text"
                          placeholder="01:00"
                          value={sendInterval}
                          onChange={(e) => setSendInterval(e.target.value)}
                          className="w-32 p-2.5 bg-primary border border-subtle rounded-lg text-[13px] text-primary focus:outline-none focus:border-accent font-mono"
                        />
                        <span className="text-[11px] text-secondary">
                          ex: 00:01 (1 seg), 01:00 (1 min)
                        </span>
                     </div>
                  </div>
                  <div className="bg-accent/10 p-3 rounded-lg border border-accent/20">
                     <p className="text-[12px] text-accent">
                        <strong>Disparo Contínuo Ativo:</strong> A campanha vai enviar mensagens ciclicamente respeitando o intervalo definido, substituindo dados das variáveis dinâmicas pelos dados mockados da API de Produtos.
                     </p>
                  </div>
                </div>
             ) : (
                <>
             <div className="flex items-center justify-between mb-4 border-t border-subtle/50 pt-5">
               <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary">Agendamento Opcional</label>
               </div>
               <div className="flex bg-primary border border-subtle rounded-lg p-1">
                 <button 
                   onClick={() => setTriggerType('manual')}
                   type="button"
                   className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${triggerType === 'manual' ? 'bg-accent text-white shadow-sm' : 'text-secondary hover:text-primary'}`}
                 >
                   Manual
                 </button>
                 <button 
                   onClick={() => setTriggerType('scheduled')}
                   type="button"
                   className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${triggerType === 'scheduled' ? 'bg-accent text-white shadow-sm' : 'text-secondary hover:text-primary'}`}
                 >
                   Agendado
                 </button>
               </div>
             </div>

             {triggerType === 'scheduled' && (
               <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-3 pb-3 border-b border-subtle/50">
                    <input 
                      type="checkbox" 
                      id="recurring" 
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="w-4 h-4 rounded border-subtle text-accent focus:ring-accent" 
                    />
                    <label htmlFor="recurring" className="text-[13px] font-medium text-primary cursor-pointer">
                      Disparo Contínuo (Recorrente)
                    </label>
                  </div>

                  <div>
                     <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-2">Dias da Semana</label>
                     <div className="flex gap-1.5 flex-wrap">
                        {DAYS.map(day => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => {
                              setScheduledDays(prev => 
                                prev.includes(day.value) ? prev.filter(d => d !== day.value) : [...prev, day.value]
                              );
                            }}
                            className={`w-9 h-9 rounded-lg text-[12px] font-bold transition-all border ${
                              scheduledDays.includes(day.value) 
                                ? 'bg-accent border-accent text-white shadow-md transform scale-105' 
                                : 'bg-primary border-subtle text-secondary hover:border-accent/50'
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                     </div>
                  </div>

                  <div>
                     <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary mb-2">Datas Específicas</label>
                     <div className="flex gap-2 mb-2">
                       <input 
                         type="date"
                         value={newDate}
                         onChange={(e) => setNewDate(e.target.value)}
                         className="flex-1 p-2 bg-primary border border-subtle rounded-lg text-[13px] text-primary focus:outline-none focus:border-accent"
                       />
                       <button 
                         type="button"
                         onClick={() => {
                           if (newDate && !scheduledDates.includes(newDate)) {
                             setScheduledDates([...scheduledDates, newDate]);
                             setNewDate('');
                           }
                         }}
                         className="px-3 bg-accent text-white rounded-lg text-[12px] font-bold h-10"
                       >
                         Add
                       </button>
                     </div>
                     <div className="flex gap-1.5 flex-wrap">
                        {scheduledDates.map(date => (
                          <div key={date} className="bg-accent/10 border border-accent/20 text-accent px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1">
                            {new Date(date + 'T00:00:00').toLocaleDateString()}
                            <button type="button" onClick={() => setScheduledDates(scheduledDates.filter(d => d !== date))}>
                              <Plus className="w-3 h-3 rotate-45 text-accent" />
                            </button>
                          </div>
                        ))}
                        {scheduledDates.length === 0 && <p className="text-[11px] text-secondary/50 italic">Nenhuma data selecionada</p>}
                     </div>
                  </div>

                  <div>
                     <div className="flex items-center justify-between mb-2">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-secondary">Horários de Disparo</label>
                        <button 
                          onClick={() => setScheduledTimes([...scheduledTimes, '09:00'])}
                          type="button"
                          className="text-[11px] text-accent font-bold flex items-center gap-1 hover:underline"
                        >
                          <Plus className="w-3 h-3" /> Adicionar Horário
                        </button>
                     </div>
                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {scheduledTimes.map((time, idx) => (
                           <div key={idx} className="relative group">
                              <input 
                                type="time" 
                                value={time}
                                onChange={(e) => {
                                  const newTimes = [...scheduledTimes];
                                  newTimes[idx] = e.target.value;
                                  setScheduledTimes(newTimes);
                                }}
                                className="w-full p-2.5 bg-primary border border-subtle rounded-lg text-[13px] text-primary focus:outline-none focus:border-accent transition-colors"
                              />
                              {scheduledTimes.length > 1 && (
                                <button 
                                  onClick={() => setScheduledTimes(scheduledTimes.filter((_, i) => i !== idx))}
                                  type="button"
                                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
             )}
             </>
             )}
          </div>

          {/* Nome Campanha - dummy field to match style */}
          <div className="mb-5">
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-2">Nome da Campanha</label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex: Oferta Relâmpago"
              className="w-full p-3 border border-subtle rounded-lg text-[14px] bg-secondary focus:outline-none focus:border-accent-primary"
            />
          </div>

          {/* Alvos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-2">Instância do WhatsApp</label>
              <select 
                value={selectedInstance}
                onChange={(e) => setSelectedInstance(e.target.value)}
                className="w-full p-3 border border-subtle rounded-lg text-[14px] bg-secondary focus:outline-none focus:border-accent-primary"
              >
                <option value="">Selecione a conexão...</option>
                {instances.map(i => <option key={i.id} value={i.id}>{i.instance_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-2">Alvo de Envio</label>
              <select 
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="w-full p-3 border border-subtle rounded-lg text-[14px] bg-secondary focus:outline-none focus:border-accent-primary"
              >
                {selectedInstance ? (
                  <>
                    <option value="">Selecione o alvo...</option>
                    {groups.filter(g => g.id.startsWith(selectedInstance + '_')).map(g => <option key={g.id} value={g.id}>{g.name} ({g.type === 'group' ? 'Grupo' : 'Contato'})</option>)}
                  </>
                ) : (
                  <option value="" disabled>Selecione a instância primeiro...</option>
                )}
              </select>
            </div>
          </div>

          <div className="mb-5 border border-subtle rounded-xl p-4 bg-white shadow-sm transition-all duration-300">
            <button 
              type="button"
              className="w-full flex items-center justify-between text-left"
              onClick={() => setIsAiSectionOpen(!isAiSectionOpen)}
            >
              <h3 className="text-[14px] font-bold text-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent-blue" /> 
                Copywriting com Inteligência Artificial
              </h3>
              {isAiSectionOpen ? <ChevronUp className="w-4 h-4 text-secondary" /> : <ChevronDown className="w-4 h-4 text-secondary" />}
            </button>
            
            {isAiSectionOpen && (
              <div className="mt-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-2">Objetivo da Campanha</label>
                    <select 
                      value={aiObjective}
                      onChange={(e) => setAiObjective(e.target.value)}
                      className="w-full p-2.5 border border-subtle rounded-lg text-[13px] bg-secondary focus:outline-none focus:border-accent-primary"
                    >
                      <option value="vender_produto">💳 Vender produto</option>
                      <option value="divulgar_promocao">🏷️ Divulgar promoção</option>
                      <option value="recuperar_cliente">🔄 Recuperar cliente</option>
                      <option value="lancamento">🚀 Lançar novo produto</option>
                      <option value="gerar_trafego">🔗 Gerar tráfego para link</option>
                      <option value="carrinho_abandonado">🛒 Lembrar carrinho abandonado</option>
                      <option value="reativar_antigo">👋 Reativar cliente antigo</option>
                      <option value="estoque_limitado">⏳ Avisar estoque limitado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-2">Tom de Voz</label>
                    <select 
                      value={aiTone}
                      onChange={(e) => setAiTone(e.target.value)}
                      className="w-full p-2.5 border border-subtle rounded-lg text-[13px] bg-secondary focus:outline-none focus:border-accent-primary"
                    >
                      <option value="profissional">👔 Profissional</option>
                      <option value="amigavel">😊 Amigável</option>
                      <option value="urgente">🔥 Urgente</option>
                      <option value="promocional">🎁 Promocional</option>
                      <option value="premium">💎 Premium</option>
                      <option value="divertido">🥳 Divertido</option>
                      <option value="direto">🎯 Direto</option>
                      <option value="consultivo">🤝 Consultivo</option>
                    </select>
                  </div>
                </div>

                <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-2">Detalhes da Oferta / Contexto (Opcional)</label>
                <textarea
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder="Ex: Tênis Nike Air Max, por R$ 299. Frete grátis usando o cupom NIKE10..."
                  rows={3}
                  className="w-full p-3 border border-subtle rounded-lg text-[14px] bg-secondary focus:outline-none focus:border-accent-primary resize-none placeholder-gray-400"
                />
                <div className="flex items-center justify-between mt-3">
                   <p className="text-[12px] text-secondary/80">Dica: A IA já usa o nome da campanha que você definiu.</p>
                   <button 
                     onClick={generateCopy}
                     disabled={generating}
                     className="bg-accent-blue text-white px-5 py-2.5 rounded-lg font-semibold text-[13px] flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                   >
                     {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4"/>} 
                     {generating ? 'Gerando Opções...' : 'Gerar 3 Opções'}
                   </button>
                </div>
              </div>
            )}
          </div>

          {aiVariations && aiVariations.length > 0 && (
            <div className="mb-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
               <h3 className="text-[14px] font-bold text-primary mb-3">Escolha a melhor opção:</h3>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {aiVariations.map((v, i) => (
                    <div key={i} className="border border-subtle rounded-xl p-4 bg-white shadow-sm flex flex-col hover:border-accent-primary transition-colors cursor-pointer" onClick={() => {
                       setMessage(v.text);
                       window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    }}>
                       <h4 className="text-[13px] font-bold text-accent-blue mb-2 pb-2 border-b border-subtle">{v.title}</h4>
                       <p className="text-[13px] text-primary whitespace-pre-wrap flex-1 mb-4 leading-relaxed font-sans">{v.text}</p>
                       <button 
                          className="w-full py-2 bg-secondary rounded-lg text-[12px] font-semibold text-primary hover:bg-gray-100 transition-colors"
                          onClick={(e) => {
                             e.stopPropagation();
                             setMessage(v.text);
                             showSuccess('Texto aplicado na campanha!');
                          }}
                       >
                          Usar esta mensagem
                       </button>
                    </div>
                  ))}
               </div>
            </div>
          )}

          <div className="mb-5">
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-2">Link de Afiliado (Carga Visual Opcional)</label>
            <div className="flex items-center gap-2">
              <div className="p-3 border border-subtle rounded-lg bg-secondary text-secondary shrink-0">
                <ImageIcon className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://imagem-do-produto.jpg"
                className="w-full p-3 border border-subtle rounded-lg text-[14px] bg-secondary focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>

          {/* Products Selector */}
          <div className="mb-5 border border-subtle rounded-xl p-4 bg-white shadow-sm transition-all duration-300">
             <div className="flex items-center justify-between mb-3">
                 <div>
                    <h3 className="text-[14px] font-bold text-primary">Produtos Mercado Livre</h3>
                    <p className="text-[11px] text-secondary">Selecione quais produtos usar nesta campanha</p>
                 </div>
                 <div className="flex items-center gap-2">
                    <label className="text-[12px] font-semibold text-secondary flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={useAllProducts} onChange={(e) => setUseAllProducts(e.target.checked)} className="rounded text-accent-blue focus:ring-accent-blue" />
                      Usar Todos Disponíveis
                    </label>
                 </div>
             </div>
             
             {!useAllProducts && (
               <div className="max-h-[150px] overflow-y-auto border border-subtle rounded-lg bg-secondary p-2 space-y-1">
                 {products.length === 0 ? (
                    <p className="text-[12px] text-secondary p-2">Nenhum produto importado. Sincronize em Integrações.</p>
                 ) : (
                    products.map(p => (
                       <label key={p.id} className="flex items-start gap-2 p-1.5 hover:bg-white rounded cursor-pointer transition-colors shadow-sm mb-1 bg-white border border-subtle">
                          <input 
                            type="checkbox" 
                            checked={selectedProductIds.includes(p.id)}
                            onChange={(e) => {
                               if (e.target.checked) setSelectedProductIds([...selectedProductIds, p.id]);
                               else setSelectedProductIds(selectedProductIds.filter(id => id !== p.id));
                            }}
                            className="mt-1 rounded text-accent-blue"
                          />
                          <div className="flex-1 min-w-0">
                             <p className="text-[12px] font-semibold text-primary truncate leading-tight">{p.product_title}</p>
                             <div className="flex items-center gap-2 mt-0.5">
                                 <span className="text-[11px] font-bold text-green-600">R$ {Number(p.product_price).toFixed(2).replace('.', ',')}</span>
                                 {p.product_discount && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">{p.product_discount} OFF</span>}
                             </div>
                          </div>
                          {p.product_image && <img src={p.product_image} alt="" className="w-8 h-8 object-contain mix-blend-multiply rounded shrink-0 border border-subtle/50" />}
                       </label>
                    ))
                 )}
               </div>
             )}
          </div>

          <div className="mb-2 relative">
            <div className="flex items-center justify-between mb-2">
               <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary">Mensagem do WhatsApp</label>
               <div className="relative">
                 <button 
                   type="button"
                   onClick={() => setShowVariableMenu(!showVariableMenu)}
                   className="text-[11px] font-bold text-accent-blue bg-accent-blue/10 px-2.5 py-1 rounded-md hover:bg-accent-blue/20 transition-colors"
                 >
                   {'{ }'} Inserir Variável
                 </button>
                 
                 {showVariableMenu && (
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-subtle rounded-xl shadow-xl z-10 p-2 text-[12px]">
                       <p className="px-2 py-1 text-[10px] uppercase font-bold text-secondary tracking-wider mb-1">Produto ML</p>
                       {[
                         { id: '{product_title}', label: 'Título do produto' },
                         { id: '{product_price}', label: 'Preço atual' },
                         { id: '{product_old_price}', label: 'Preço antigo' },
                         { id: '{product_discount}', label: 'Desconto' },
                         { id: '{product_link}', label: 'Link original' },
                         { id: '{product_affiliate_link}', label: 'Link afiliado' },
                         { id: '{product_image}', label: 'Imagem (se vazio)' }
                       ].map(v => (
                          <button
                             key={v.id}
                             type="button"
                             onClick={() => {
                               setMessage(prev => prev + v.id);
                               setShowVariableMenu(false);
                             }}
                             className="w-full text-left px-2 py-1.5 hover:bg-secondary rounded flex items-center justify-between group"
                          >
                             <span className="font-medium text-primary">{v.label}</span>
                             <span className="font-mono text-[10px] text-secondary group-hover:text-accent-blue">{v.id}</span>
                          </button>
                       ))}
                    </div>
                 )}
               </div>
            </div>
            
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite sua mensagem. Ex: Oferta imperdível: {product_title}..."
              rows={6}
              className="w-full p-3 border border-subtle rounded-lg text-[14px] bg-secondary focus:outline-none focus:border-accent-primary resize-none"
            />
          </div>
        </div>

      {/* Live Preview Pane */}
        <div className="flex flex-col items-center">
          <PhonePreview 
             message={message} 
             imageUrl={imageUrl} 
             dummyProduct={products.length > 0 ? products[0] : null}
          />
        </div>
      </div>

      {/* Global Toasts */}
      {(errorMsg || successMsg) && (
        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
           {errorMsg && (
             <div className="bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 max-w-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-[14px] font-medium leading-snug">{errorMsg}</p>
             </div>
           )}
           {successMsg && (
             <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 max-w-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <p className="text-[14px] font-medium leading-snug">{successMsg}</p>
             </div>
           )}
        </div>
      )}

    </div>
  );
}

