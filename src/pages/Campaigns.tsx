import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, onSnapshot, serverTimestamp, orderBy, deleteDoc, doc, updateDoc, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils';
import PhonePreview from '../components/PhonePreview';
import { Send, Bot, Loader2, Sparkles, Image as ImageIcon, Plus, Trash2, Calendar, Megaphone, Edit2, Clock, CheckCircle2, AlertCircle, Play, Pause, ChevronDown, ChevronUp, Copy, Wand2, Type, Zap, BookOpen, Quote } from 'lucide-react';

export default function Campaigns() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [campaignsList, setCampaignsList] = useState<any[]>([]);

  useEffect(() => {
    if (location.state?.offerId) {
      setIsCreating(true);
      setMessageMode('auto_offer');
    }
  }, [location]);

  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  
  const [isAiSectionOpen, setIsAiSectionOpen] = useState(false);
  const [messageMode, setMessageMode] = useState<'manual' | 'auto_offer'>('manual');
  const [instructionIA, setInstructionIA] = useState('');
  
  const [instances, setInstances] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  
  const [targets, setTargets] = useState<{instance_id: string, group_id: string}[]>([{ instance_id: '', group_id: '' }]);
  const [syncedInstances, setSyncedInstances] = useState<Set<string>>(new Set());
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
    targets.forEach(target => {
      const instanceId = target.instance_id;
      if (instanceId && !syncedInstances.has(instanceId)) {
        setSyncedInstances(prev => new Set(prev).add(instanceId));
        fetch(`/api/whatsapp/sync?instanceId=${instanceId}`)
          .then(res => res.json())
          .then(syncData => {
             const transientGroups: any[] = [];
             for (const g of (syncData.groups || [])) {
                 transientGroups.push({ id: instanceId + '_' + g.id, name: g.subject || g.name || 'Grupo', type: 'group' });
             }
             for (const c of (syncData.contacts || [])) {
                 transientGroups.push({ id: instanceId + '_' + c.id, name: c.name || c.notify || c.verifiedName || c.pushname || c.id?.split('@')[0] || 'Contato', type: 'contact' });
             }
             setGroups(prev => {
                 const map = new Map(prev.map(p => [p.id, p]));
                 transientGroups.forEach(tg => map.set(tg.id, tg));
                 return Array.from(map.values());
             });
          })
          .catch(console.error);
      }
    });
  }, [targets, syncedInstances]);

  // AI Prompt details
  const [productUrl, setProductUrl] = useState('');
  const [aiObjective, setAiObjective] = useState('vender_produto');
  const [aiTone, setAiTone] = useState('Amigável');
  const [offerCategory, setOfferCategory] = useState('todos');
  const [offerMarketplace, setOfferMarketplace] = useState('all');
  const [marketplaces, setMarketplaces] = useState<any[]>([]);
  const [loadingMarketplaces, setLoadingMarketplaces] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    setCategories(["todos", "tecnologia", "casa_moveis", "eletrodomesticos", "esporte_fitness", "ferramentas", "moda", "beleza", "mercado", "brinquedos", "automotivo"]);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || messageMode !== 'auto_offer') return;

    setLoadingMarketplaces(true);
    // Check ml api natively
    const mps: any[] = [];
    fetch(`/api/integrations/mercadolivre/status`)
        .then(res => res.json())
        .then(mlData => {
            if (mlData.ok && mlData.connected) {
                mps.push({ id: 'mercadolivre', name: 'Mercado Livre' });
            }
            // fallback fetch the original for others if they existed
            return fetch(`/api/integrations/connected-marketplaces?userId=${user.uid}`);
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok && data.marketplaces) {
                for (const mp of data.marketplaces) {
                    if (mp.id !== 'mercadolivre' && !mps.find(existing => existing.id === mp.id)) {
                        mps.push(mp);
                    }
                }
            }
            setMarketplaces(mps);
            if (mps.length === 1) {
              setOfferMarketplace(mps[0].id);
            } else if (mps.length >= 2) {
              setOfferMarketplace('all');
            }
        })
        .catch(console.error)
        .finally(() => setLoadingMarketplaces(false));
  }, [messageMode]);

  const handleAICalling = async (instruction: string) => {
    if (!message && instruction.includes('texto')) {
      showError("Escreva algo ou dê uma instrução clara para a IA.");
      return;
    }
    setGenerating(true);
    try {
      if (instruction.includes('variações')) {
        const res = await fetch('/api/ai/generate-variations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message })
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        
        setAiVariations(data.variations.map((v: string) => ({ title: 'Sugestão', text: v })));
        showSuccess("Variações geradas!");
      } else {
        const res = await fetch('/api/ai/generate-copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction, currentText: message, tone: aiTone })
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);

        setMessage(data.text);
        showSuccess("Copy processada com sucesso!");
      }
    } catch (e: any) {
      showError("Erro na IA: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

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


  const handleSend = async () => {
    const isValidTargets = targets.every(t => t.instance_id && t.group_id);
    if (!isValidTargets || !message || !campaignName || targets.length === 0) {
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
      // For MVP, just check the first instance
      const statusRes = await fetch(`/api/whatsapp/status?instanceId=${targets[0].instance_id}`);
      if (statusRes.ok) {
         const statusData = await statusRes.json();
         if (statusData.status !== 'connected') {
             showError('Uma ou mais Instâncias de WhatsApp não estão conectadas. Por favor, conecte via QR Code antes de salvar.');
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
          instance_id: targets[0].instance_id, 
          target_group_id: targets[0].group_id, 
          targets: targets,
          message,
          message_mode: messageMode,
          instruction_ia: instructionIA,
          offer_category: offerCategory,
          offer_marketplace: offerMarketplace,
          allowed_offer_marketplaces: marketplaces.map(m => m.id),
          ai_tone: aiTone,
          image_url: imageUrl || '',
          use_ml_products: messageMode === 'auto_offer',
          ml_product_ids: selectedProductIds,
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
      const isStarting = ['paused', 'draft', 'failed', 'sent'].includes(currentStatus);
      const newStatus = isStarting ? 'scheduled' : 'paused';
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
    if (camp.targets && camp.targets.length > 0) {
      setTargets(camp.targets);
    } else {
      setTargets([{ instance_id: camp.instance_id || '', group_id: camp.target_group_id || '' }]);
    }
    setMessageMode(camp.message_mode || (camp.use_ml_products ? 'auto_offer' : 'manual'));
    setInstructionIA(camp.instruction_ia || '');
    setOfferCategory(camp.offer_category || 'Todos');
    setOfferMarketplace(camp.offer_marketplace || 'all');
    setAiTone(camp.ai_tone || 'Amigável');
    setPreviewProduct(null); 
    setMessage(camp.message || '');
    setImageUrl(camp.image_url || '');
    setTriggerType(camp.trigger_type === 'auto' ? 'manual' : (camp.trigger_type || 'manual'));
    setAutoSendNow(camp.auto_send_now || camp.trigger_type === 'auto' || false);
    setSendInterval(camp.send_interval || '00:00');
    setIsRecurring(camp.is_recurring || false);
    setScheduledDays(camp.scheduled_days || []);
    setScheduledTimes(camp.scheduled_times || ['09:00']);
    setScheduledDates(camp.scheduled_dates || []);
    
    setSelectedProductIds(Array.isArray(camp.ml_product_ids) ? camp.ml_product_ids : []);
    
    setIsCreating(true);
  };

  const handleTriggerCampaign = async (id: string, camp: any) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const targetList = (camp.targets && camp.targets.length > 0) 
        ? camp.targets 
        : [{ instance_id: camp.instance_id, group_id: camp.target_group_id }];

      // Check first instance connection
      const firstTarget = targetList[0];
      const statusRes = await fetch(`/api/whatsapp/status?instanceId=${firstTarget.instance_id}`);
      if (statusRes.ok) {
         const statusData = await statusRes.json();
         if (statusData.status !== 'connected') {
             showError('Uma ou mais instâncias não estão conectadas. Verifique o WhatsApp.');
             return;
         }
      }

      await updateDoc(doc(db, 'campaigns', id), {
        status: 'sending',
        updated_at: serverTimestamp()
      });
      
      // Prepare message and image
      const prepRes = await fetch('/api/campaigns/prepare-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: id,
          category: camp.offer_category,
          marketplace: camp.offer_marketplace || 'all',
          userId: user.uid,
          template: camp.message,
          tone: camp.ai_tone,
          messageMode: camp.message_mode || (camp.use_ml_products ? 'auto_offer' : 'manual')
        })
      });

      const prepData = await prepRes.json();
      if (!prepRes.ok || !prepData.ok) {
        if (prepData.noMoreProducts) {
          showError("Todos os produtos desta categoria já foram enviados nesta campanha.");
          await updateDoc(doc(db, 'campaigns', id), { status: 'paused', updated_at: serverTimestamp() });
          return;
        }
        throw new Error(prepData.error || "Erro ao preparar mensagem.");
      }

      const messageText = prepData.message;
      const finalImageUrl = prepData.imageUrl || camp.image_url;

      const errors: string[] = [];
      for (const target of targetList) {
          const jid = target.group_id.replace(`${target.instance_id}_`, '');
          try {
            const res = await fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instanceId: target.instance_id,
                to: jid,
                message: messageText,
                image_url: finalImageUrl
              })
            });
            if (!res.ok) errors.push(`Erro ao enviar para ${jid}`);
          } catch (e: any) {
            errors.push(`Erro no envio para ${jid}: ${e.message}`);
          }
      }

      if (errors.length > 0) throw new Error(errors.join(', '));

      // Mark as sent in history if it was an auto offer
      if (prepData.productId) {
        await fetch('/api/campaigns/mark-sent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: id, productId: prepData.productId, userId: user.uid })
        });
      }

      showSuccess('Campanha disparada com sucesso!');
      await updateDoc(doc(db, 'campaigns', id), {
        status: (camp.is_recurring || camp.trigger_type === 'auto') ? 'scheduled' : 'sent',
        last_run: serverTimestamp(),
        updated_at: serverTimestamp()
      });
    } catch (e: any) {
      console.error(e);
      showError('Falha: ' + e.message);
      await updateDoc(doc(db, 'campaigns', id), { status: 'failed', updated_at: serverTimestamp() });
    }
  };

  if (!isCreating) {
    return (
      <div className="flex-1 flex flex-col h-full bg-gray-50/50">
        <header className="h-[72px] border-b border-gray-200 bg-white flex items-center justify-between px-6 md:px-10 shrink-0">
          <div>
            <h1 className="text-[20px] font-bold text-gray-900 tracking-tight">Campanhas</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">Gerencie suas campanhas e automações de disparo</p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold text-[13px] flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-sm hover:shadow"
          >
            <Plus className="w-4 h-4" /> Nova Campanha
          </button>
        </header>

        <div className="p-6 md:p-10 flex-1 overflow-y-auto">
          {campaignsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center max-w-md mx-auto">
              <div className="w-16 h-16 bg-white border border-gray-100 rounded-2xl flex items-center justify-center shadow-sm mb-5">
                <Megaphone className="w-8 h-8 text-indigo-500" />
              </div>
              <h3 className="text-[18px] font-bold text-gray-900 mb-2">Nenhuma campanha criada</h3>
              <p className="text-[14px] text-gray-500 mb-8 leading-relaxed">Crie sua primeira campanha para disparar mensagens e aumentar suas vendas de forma automatizada.</p>
              <button 
                onClick={() => setIsCreating(true)}
                className="bg-white border border-gray-200 text-gray-900 px-6 py-2.5 rounded-xl font-semibold text-[13px] flex items-center gap-2 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" /> Criar Primeira Campanha
              </button>
            </div>
          ) : (
            <div className="space-y-4 max-w-5xl">
              {campaignsList.map(camp => (
                <div key={camp.id} className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-gray-300 transition-colors">
                  <div className="flex items-center gap-4">
                     <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100/50 flex items-center justify-center text-indigo-600 shrink-0">
                        <Send className="w-6 h-6" />
                     </div>
                     <div>
                       <h3 className="text-[15px] font-bold text-gray-900">{camp.name}</h3>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-500 mt-1">
              <span className="flex items-center gap-1 font-medium"><Calendar className="w-3.5 h-3.5"/> {camp.created_at?.toDate()?.toLocaleDateString()}</span>
              <span className="text-gray-300">•</span>
              {camp.trigger_type === 'scheduled' && (
                <>
                  <span className="flex items-center gap-1 text-indigo-600 font-medium"><Clock className="w-3.5 h-3.5"/> Programado</span>
                  <span className="text-gray-300">•</span>
                </>
              )}
              {camp.trigger_type === 'auto' && (
                <>
                  <span className="flex items-center gap-1 text-teal-600 font-medium"><Sparkles className="w-3.5 h-3.5"/> Contínuo</span>
                  <span className="text-gray-300">•</span>
                </>
              )}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${camp.status === 'sent' ? 'bg-green-50 text-green-700 border border-green-200' : camp.status === 'failed' ? 'bg-red-50 text-red-700 border border-red-200' : camp.status === 'paused' ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                  {camp.status === 'sending' ? 'Enviando...' : (camp.status === 'sent' ? 'Enviada' : (camp.status === 'scheduled' ? 'Ativa' : (camp.status === 'paused' ? 'Pausada' : camp.status)))}
              </span>
            </div>
            {camp.trigger_type === 'scheduled' && (
              <div className="mt-2 text-[12px] flex flex-wrap gap-x-2 gap-y-1">
                 {camp.scheduled_days?.length > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg border border-gray-200 font-medium">Dias: {camp.scheduled_days.map((d: number) => DAYS.find(day => day.value === d)?.label).join(', ')}</span>}
                 {camp.scheduled_dates?.length > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg border border-gray-200 font-medium">{camp.scheduled_dates.length} data(s) fixa(s)</span>}
                 <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg border border-gray-200 font-medium">às {camp.scheduled_times?.join(', ')}</span>
              </div>
            )}
            {camp.trigger_type === 'auto' && (
              <div className="mt-2 text-[12px] flex flex-wrap gap-x-2 gap-y-1">
                 <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-lg border border-teal-100 font-medium">A cada {camp.send_interval || '00:00'} (MM:SS)</span>
              </div>
            )}
                     </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                     {camp.trigger_type === 'auto' || camp.trigger_type === 'scheduled' ? (
                        <button
                          onClick={() => handleTogglePause(camp.id, camp.status)}
                          disabled={camp.status === 'sending'}
                          className={`px-4 py-2 ${
                            ['paused', 'draft', 'failed', 'sent'].includes(camp.status)
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700 border-transparent' 
                              : camp.status === 'sending'
                                ? 'bg-indigo-600/50 text-white cursor-not-allowed border-transparent'
                                : 'bg-white text-red-600 border-gray-200 hover:bg-red-50 hover:border-red-200'
                          } border rounded-xl text-[13px] font-semibold transition-colors shadow-sm flex items-center justify-center min-w-[120px]`}
                        >
                          {camp.status === 'sending' ? (
                            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-white" /> Enviando...</span>
                          ) : (camp.status === 'scheduled' || camp.status === 'sending') ? (
                            'Parar Disparos'
                          ) : (
                            'Disparar Agora'
                          )}
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleTriggerCampaign(camp.id, camp)} 
                          disabled={camp.status === 'sending'}
                          className="px-4 py-2 bg-indigo-600 text-white border border-transparent rounded-xl text-[13px] font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center min-w-[120px]"
                        >
                          {camp.status === 'sending' ? (
                            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-white" /> Enviando...</span>
                          ) : 'Disparar Agora'}
                        </button>
                      )}
                     <div className="flex items-center gap-1 border-l border-gray-200 pl-2 sm:pl-3 ml-1 sm:ml-2">
                       <button onClick={() => handleEditCampaign(camp)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                          <Edit2 className="w-4.5 h-4.5" />
                       </button>
                       <button onClick={() => handleDeleteCampaign(camp.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                          <Trash2 className="w-4.5 h-4.5" />
                       </button>
                     </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Toasts */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3.5 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex items-center gap-3 min-w-[300px] max-w-md animate-in fade-in slide-in-from-bottom-5">
             <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
             <p className="text-[13.5px] font-medium leading-snug">{errorMsg}</p>
          </div>
        )}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3.5 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex items-center gap-3 min-w-[300px] max-w-md animate-in fade-in slide-in-from-bottom-5">
             <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600" />
             <p className="text-[13.5px] font-medium leading-snug">{successMsg}</p>
          </div>
        )}
      </div>

      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50/50">
      {/* Header */}
      <header className="h-[72px] border-b border-gray-200 bg-white flex items-center justify-between px-6 md:px-10 shrink-0">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900 tracking-tight">{editingId ? 'Editar Campanha' : 'Nova Campanha'}</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Configure mensagens persuasivas e defina os alvos</p>
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
              }} className="px-5 py-2.5 border border-gray-200 bg-white rounded-xl font-semibold text-[13px] text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                Cancelar
              </button>
          <button 
            onClick={handleSend}
            disabled={sending}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold text-[13px] flex items-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Campanha'}
          </button>
        </div>
      </header>

      {/* Content Area */}
      <div className="p-6 md:p-10 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 max-w-[1400px] mx-auto items-start">
        {/* Configure Builder */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-3xl p-6 md:p-8 flex flex-col">
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
                        <strong>Disparo Contínuo Ativo:</strong> A campanha vai enviar mensagens ciclicamente respeitando o intervalo definido, selecionando automaticamente produtos variados do <strong>Banco de Ofertas (Robot)</strong>.
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
          <div className="mb-5 space-y-4">
            {targets.map((target, idx) => (
              <div key={idx} className="relative bg-gray-50/50 p-4 rounded-xl border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => setTargets(targets.filter((_, i) => i !== idx))}
                    className="absolute -top-3 -right-3 w-7 h-7 bg-white text-red-500 rounded-full border border-gray-200 shadow-sm flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors z-10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <div>
                  <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-2">Instância do WhatsApp</label>
                  <select 
                    value={target.instance_id}
                    onChange={(e) => {
                      const newTargets = [...targets];
                      newTargets[idx].instance_id = e.target.value;
                      newTargets[idx].group_id = ''; // reset group when instance changes
                      setTargets(newTargets);
                    }}
                    className="w-full p-3 border border-subtle rounded-lg text-[14px] bg-white focus:outline-none focus:border-accent-primary"
                  >
                    <option value="">Selecione a conexão...</option>
                    {instances.map(i => <option key={i.id} value={i.id}>{i.instance_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary mb-2">Alvo de Envio</label>
                  <select 
                    value={target.group_id}
                    onChange={(e) => {
                      const newTargets = [...targets];
                      newTargets[idx].group_id = e.target.value;
                      setTargets(newTargets);
                    }}
                    className="w-full p-3 border border-subtle rounded-lg text-[14px] bg-white focus:outline-none focus:border-accent-primary"
                  >
                    {target.instance_id ? (
                      <>
                        <option value="">Selecione o alvo...</option>
                        {groups.filter(g => g.id.startsWith(target.instance_id + '_')).map(g => <option key={g.id} value={g.id}>{g.name} ({g.type === 'group' ? 'Grupo' : 'Contato'})</option>)}
                      </>
                    ) : (
                      <option value="" disabled>Selecione a instância primeiro...</option>
                    )}
                  </select>
                </div>
              </div>
            ))}
            <button
               type="button"
               onClick={() => setTargets([...targets, { instance_id: '', group_id: '' }])}
               className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Adicionar outro Alvo
            </button>
          </div>

          {/* Copyright Expert IA */}
          <div className="mb-5 border border-indigo-100 rounded-xl p-0 bg-white shadow-sm overflow-hidden">
            <button 
              type="button"
              className={`w-full flex items-center justify-between text-left p-4 transition-colors ${isAiSectionOpen ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`}
              onClick={() => setIsAiSectionOpen(!isAiSectionOpen)}
            >
              <h3 className="text-[14px] font-bold text-indigo-900 flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-600" /> 
                Copyright Expert IA
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-indigo-500 uppercase tracking-wider">Assistente Ativo</span>
                {isAiSectionOpen ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
              </div>
            </button>
            
            {isAiSectionOpen && (
              <div className="p-5 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="mb-4">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Instruções para a IA</label>
                  <textarea
                    value={instructionIA}
                    onChange={(e) => setInstructionIA(e.target.value)}
                    placeholder="Ex: Transforme este texto em uma oferta irresistível com foco em urgência..."
                    rows={2}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:border-indigo-500 min-h-[60px]"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  <button 
                    onClick={() => handleAICalling('Melhore este texto focando em conversão')}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white border border-gray-200 rounded-lg text-[12px] font-bold text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-indigo-500" /> Melhorar Copy
                  </button>
                  <button 
                    onClick={() => handleAICalling('Crie 3 variações curtas deste texto')}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white border border-gray-200 rounded-lg text-[12px] font-bold text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm"
                  >
                    <Type className="w-3.5 h-3.5 text-indigo-500" /> Criar Variações
                  </button>
                  <button 
                    onClick={() => handleAICalling('Mude o tom para ser mais engraçado e amigável')}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white border border-gray-200 rounded-lg text-[12px] font-bold text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm"
                  >
                    <Zap className="w-3.5 h-3.5 text-indigo-500" /> Mudar Tom
                  </button>
                  <button 
                    onClick={() => handleAICalling('Simplifique o texto para ser rápido de ler')}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white border border-gray-200 rounded-lg text-[12px] font-bold text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-indigo-500" /> Simplificar
                  </button>
                  <button 
                    onClick={() => handleAICalling('Torne o texto muito mais persuasivo')}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white border border-gray-200 rounded-lg text-[12px] font-bold text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> Persuadir
                  </button>
                  <button 
                    onClick={() => handleAICalling('Conte uma pequena história sobre o benefício deste produto')}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-white border border-gray-200 rounded-lg text-[12px] font-bold text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm"
                  >
                    <Quote className="w-3.5 h-3.5 text-indigo-500" /> Storytelling
                  </button>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <span className="text-[11px] text-gray-400 italic">IA alimentada por Gemini Flash 1.5</span>
                  <button 
                    onClick={() => handleAICalling(instructionIA || 'Melhore meu copy')}
                    disabled={generating || !message}
                    className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-bold text-[13px] flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50"
                  >
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4"/>} 
                    {generating ? 'Processando...' : 'Aplicar com IA'}
                  </button>
                </div>

                {aiVariations && (
                  <div className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 animate-in zoom-in-95 duration-200">
                    <h4 className="text-[12px] font-bold text-indigo-900 mb-3 flex items-center justify-between">
                      Sugestões da IA
                      <button onClick={() => setAiVariations(null)} className="text-indigo-400 hover:text-indigo-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </h4>
                    <div className="space-y-3">
                      {aiVariations.map((v, i) => (
                        <div key={i} className="bg-white p-3 rounded-lg border border-indigo-200 shadow-sm relative group">
                          <p className="text-[12px] text-gray-700 leading-relaxed pr-8">{v.text}</p>
                          <button 
                            onClick={() => { setMessage(v.text); setAiVariations(null); }}
                            className="absolute top-2 right-2 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md transition-all shadow-sm"
                            title="Usar esta variação"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Modo de Mensagem</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                type="button"
                onClick={() => setMessageMode('manual')}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${messageMode === 'manual' ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/10' : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${messageMode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <Type className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <span className={`block text-[13px] font-bold ${messageMode === 'manual' ? 'text-indigo-900' : 'text-gray-900'}`}>Mensagem Personalizada</span>
                  <span className="text-[10px] text-gray-500 font-medium">Texto real fixo em todos os envios</span>
                </div>
              </button>

              <button 
                type="button"
                onClick={() => {
                   setMessageMode('auto_offer');
                   if (!message || message.trim() === '') {
                       setMessage('⚡ {Category} | {Marketplace}\n\n🛍️ {Product_Name}\n\n🚫 De: {Product_Old_Price}\n💲 Por: {Product_Price}\n\n🛒 {Product_Affiliate_Link}');
                   }
                }}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${messageMode === 'auto_offer' ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-600/10' : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${messageMode === 'auto_offer' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <span className={`block text-[13px] font-bold ${messageMode === 'auto_offer' ? 'text-indigo-900' : 'text-gray-900'}`}>Oferta Automática</span>
                  <span className="text-[10px] text-gray-500 font-medium">Usa produtos reais do Banco de Ofertas</span>
                </div>
              </button>
            </div>
          </div>
          
          {messageMode === 'auto_offer' && (
            <div className="mb-6 p-5 bg-indigo-50/30 border border-indigo-100 rounded-2xl animate-in fade-in slide-in-from-left-2 duration-300">
               <div className="flex items-center gap-2 mb-4">
                 <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                   <Zap className="w-4 h-4" />
                 </div>
                 <h3 className="text-[14px] font-bold text-indigo-900">Configuração de Oferta Automática</h3>
               </div>

               {loadingMarketplaces ? (
                 <div className="flex items-center gap-2 py-4">
                   <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                   <span className="text-[13px] text-indigo-600 font-medium">Carregando marketplaces conectados...</span>
                 </div>
               ) : marketplaces.length === 0 ? (
                 <div className="bg-white border border-red-100 p-4 rounded-xl flex flex-col items-center text-center">
                   <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                   <p className="text-[13px] text-gray-700 font-medium mb-3">Conecte pelo menos um marketplace em Integrações para usar Oferta Automática.</p>
                   <button 
                     onClick={() => navigate('/integrations')}
                     className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-[12px] font-bold hover:bg-indigo-700 transition-colors"
                   >
                     Ir para Integrações
                   </button>
                 </div>
               ) : (
                 <div className="space-y-4">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="block text-[11px] font-bold uppercase text-gray-500 mb-2">Marketplace da Oferta</label>
                       <select 
                         value={offerMarketplace}
                         onChange={(e) => setOfferMarketplace(e.target.value)}
                         className="w-full p-2.5 border border-gray-200 rounded-lg text-[13px] bg-white focus:outline-none focus:border-indigo-500 shadow-sm"
                       >
                         {marketplaces.length >= 2 && <option value="all">Todos (Marketplaces Conectados)</option>}
                         {marketplaces.map(mp => (
                           <option key={mp.id} value={mp.id}>{mp.name}</option>
                         ))}
                       </select>
                     </div>
                     <div>
                       <label className="block text-[11px] font-bold uppercase text-gray-500 mb-2">Categoria das Ofertas</label>
                       <select 
                         value={offerCategory}
                         onChange={(e) => setOfferCategory(e.target.value)}
                         className="w-full p-2.5 border border-gray-200 rounded-lg text-[13px] bg-white focus:outline-none focus:border-indigo-500 shadow-sm"
                       >
                         {categories.length > 0 ? categories.map(cat => (
                           <option key={cat} value={cat} className="capitalize">{cat.replace('_', ' e ')}</option>
                         )) : (
                           <option value="todos">Todos</option>
                         )}
                       </select>
                     </div>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="block text-[11px] font-bold uppercase text-gray-500 mb-2">Tom das Mensagens</label>
                       <select 
                         value={aiTone}
                         onChange={(e) => setAiTone(e.target.value)}
                         className="w-full p-2.5 border border-gray-200 rounded-lg text-[13px] bg-white focus:outline-none focus:border-indigo-500 shadow-sm"
                       >
                         <option value="Oferta agressiva">🔥 Oferta agressiva</option>
                         <option value="Urgência">⏳ Urgência</option>
                         <option value="Amigável">😊 Amigável</option>
                         <option value="Direto ao ponto">🎯 Direto ao ponto</option>
                         <option value="Premium">💎 Premium</option>
                         <option value="Engraçado">🥳 Engraçado</option>
                       </select>
                     </div>
                   </div>
                   
                   <p className="text-[11px] text-indigo-600/70 mt-2 leading-relaxed bg-white/60 p-3 rounded-lg border border-indigo-100/50">
                    O sistema selecionará automaticamente ofertas de <strong>{offerMarketplace === 'all' ? 'todos os marketplaces conectados' : marketplaces.find(m => m.id === offerMarketplace)?.name}</strong> na categoria <strong>{offerCategory}</strong>.
                   </p>
                 </div>
               )}
            </div>
          )}

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
                         { id: '{product_image}', label: 'Imagem' },
                         { id: '{product_store}', label: 'Loja' },
                         { id: '{product_id}', label: 'ID' },
                         { id: '{product_coupon}', label: 'Cupom' }
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
        <div className="flex flex-col items-center sticky top-0">
          <PhonePreview 
             message={message} 
             imageUrl={imageUrl} 
             dummyProduct={products.length > 0 ? products[0] : null}
          />
        </div>
        </div>
      </div>

      {/* Global Toasts */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3.5 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex items-center gap-3 min-w-[300px] max-w-md animate-in fade-in slide-in-from-bottom-5">
             <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
             <p className="text-[13.5px] font-medium leading-snug">{errorMsg}</p>
          </div>
        )}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3.5 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex items-center gap-3 min-w-[300px] max-w-md animate-in fade-in slide-in-from-bottom-5">
             <CheckCircle2 className="w-5 h-5 shrink-0 text-green-600" />
             <p className="text-[13.5px] font-medium leading-snug">{successMsg}</p>
          </div>
        )}
      </div>

    </div>
  );
}

