import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth, db, GLOBAL_USER_ID } from '../lib/firebase.js';
import { collection, query, where, getDocs, addDoc, onSnapshot, serverTimestamp, orderBy, deleteDoc, doc, updateDoc, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-utils.js';
import PhonePreview from '../components/PhonePreview.js';
import { Send, Bot, Loader2, Sparkles, Image as ImageIcon, Plus, Trash2, Calendar, Megaphone, Edit2, Clock, CheckCircle2, AlertCircle, Play, Pause, ChevronDown, ChevronUp, Copy, Wand2, Type, Zap, BookOpen, Quote } from 'lucide-react';
import { fetchWithTimeout, fetchJson } from '../utils/apiUtils.js';
import { renderOfferMessage } from '../utils/messageFormatter.js';
import { normalizeTarget } from '../utils/targetUtils.js';
import { AffiliateLinkResolverWidget } from '../components/AffiliateLinkResolverWidget.js';

export default function Campaigns() {
  const location = useLocation();
  const navigate = useNavigate();
  const [messageMode, setMessageMode] = useState<'manual' | 'auto_offer'>('manual');
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
  
  // Refactored States as requested
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  
  // Logging state on each render as requested
  console.log("RENDER_SEND_BUTTON_STATE", { isSendingNow });
  
  const [isCheckingIntegration, setIsCheckingIntegration] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [isLoadingCampaign, setIsLoadingCampaign] = useState(false);
  const [isAiGeneratingCopy, setIsAiGeneratingCopy] = useState(false);
  const [loadingRowIds, setLoadingRowIds] = useState<Set<string>>(new Set());

  // Forced reset of sending state when switching views
  useEffect(() => {
    console.log("SEND_NOW_STATE_FORCED_RESET", { editingId, isCreating });
    setIsSendingNow(false);
  }, [editingId, isCreating, messageMode]);

  const [isAiSectionOpen, setIsAiSectionOpen] = useState(false);
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
  const [offerCategory, setOfferCategory] = useState('Geral');
  const [offerMarketplace, setOfferMarketplace] = useState('all');
  const [marketplaces, setMarketplaces] = useState<any[]>([]);
  const [marketplacesLoaded, setMarketplacesLoaded] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<any>(null);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    setCategories(["Todos", "Tecnologia", "Casa e Cozinha", "Beleza e Saúde", "Moda", "Ferramentas", "Automotivo", "Brinquedos", "Esporte e Fitness", "Geral"]);
  }, []);

  // Fetch marketplaces whenever we enter creation/edit mode or change to auto_offer
  useEffect(() => {
    if (!isCreating && messageMode !== 'auto_offer') {
       // Reset if we leave the configuration area
       if (!isCreating) {
          setMarketplacesLoaded(false);
       }
       return;
    }
    
    const user = { uid: GLOBAL_USER_ID };
    if (!user) return;

    const fetchMarketplaces = async () => {
        setIsCheckingIntegration(true);
        setMarketplacesLoaded(false); // Ensure it's false while loading
        console.log("ML_INTEGRATION_STATUS_REQUEST", user.uid);
        try {
            const res = await fetch(`/api/integrations/connected-marketplaces?userId=${user.uid}&_t=${Date.now()}`);
            const data = await res.json();
            console.log("ML_INTEGRATION_STATUS_RESULT", data);
            
            const mps: any[] = [];
            if (data.ok && data.marketplaces) {
                for (const mp of data.marketplaces) {
                    mps.push(mp);
                }
            }
            
            // Mandatory inclusion of Global Bank if missing
            if (!mps.find(m => m.id === 'mercadolivre_global')) {
                mps.push({ id: 'mercadolivre_global', name: 'Mercado Livre (Banco Global)' });
            }
            
            setMarketplaces(mps);
            
            if (mps.length > 0) {
              setOfferMarketplace(current => {
                // If it's "all" and we have many, keep it. 
                // If it's a specific one that doesn't exist in mps anymore, reset.
                if (current === 'all' && mps.length >= 2) return 'all';
                if (current && mps.some(m => m.id === current)) return current;
                if (mps.length === 1) return mps[0].id;
                return 'all';
              });
            }
        } catch (error) {
            console.error("Error fetching marketplaces:", error);
        } finally {
            setIsCheckingIntegration(false);
            setMarketplacesLoaded(true);
        }
    };

    fetchMarketplaces();
  }, [isCreating, messageMode, GLOBAL_USER_ID]);

  useEffect(() => {
    if (messageMode === 'auto_offer') {
      setMessage((currentMessage) => {
        const defaultTemplate = '⚡ {category} | {marketplace}\n\n🛍️ {product_title}\n\n🚫 {product_old_price}\n💲 {product_price}\n📉 {discountPercent}% OFF\n\n🎟️ {product_coupon}\n\n🛒 Comprar agora:\n{product_link}';
        if (!currentMessage || currentMessage.trim() === '') {
          console.log("AUTO_OFFER_TEMPLATE_LOADED", "Setting default template");
          return defaultTemplate;
        }
        console.log("AUTO_OFFER_TEMPLATE_LOADED", "Using existing template");
        return currentMessage;
      });
      
      const user = { uid: GLOBAL_USER_ID };
      if (!user) return;
      
      setIsGeneratingPreview(true);
      fetch(`/api/campaigns/preview/preview-offer?category=${encodeURIComponent(offerCategory)}&marketplace=${encodeURIComponent(offerMarketplace)}&userId=${user.uid}`)
        .then(res => res.json())
        .then(data => {
            if (data.product) {
                console.log("AUTO_OFFER_PREVIEW_PRODUCT_LOADED", data.product.id || data.product.productId);
                setPreviewProduct(data.product);
                
                // Technical warning if affiliate conversion failed
                const link = data.product.product_link || data.product.product_affiliate_link || '';
                if (link && link.includes('produto.mercadolivre.com')) {
                    console.warn("TECHNICAL_WARNING_AFFILIATE_PREVIEW_FAIL: Link shown is a raw canonical URL, not a converted Meli link. Check backend logs for Cookie Builder errors.", { targetLink: link });
                }
            } else {
                setPreviewProduct(null);
            }
        })
        .catch(err => {
            console.error(err);
            setPreviewProduct(null);
        })
        .finally(() => setIsGeneratingPreview(false));
    } else {
      setPreviewProduct(null);
    }
  }, [messageMode, offerCategory, offerMarketplace]);

  const handleAICalling = async (instruction: string) => {
    if (!message && instruction.includes('texto')) {
      showError("Escreva algo ou dê uma instrução clara para a IA.");
      return;
    }
    setIsAiGeneratingCopy(true);
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
      setIsAiGeneratingCopy(false);
    }
  };

  const [aiVariations, setAiVariations] = useState<{title: string, text: string}[] | null>(null);

  useEffect(() => {
    const user = { uid: GLOBAL_USER_ID };
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
      const now = Date.now();
      const camps = snapshot.docs.map((d: any) => {
        const data = d.data();
        
        // Accurate timestamp detection for multi-format fields
        const rawTs = data.lastSendStartedAt || data.updatedAt || data.updated_at || data.last_run || data.last_send_started_at;
        const updatedAtMillis = rawTs?.toMillis?.() || (rawTs instanceof Date ? rawTs.getTime() : (typeof rawTs === 'string' ? new Date(rawTs).getTime() : 0));
        
        // Auto-recovery for stuck campaigns (status: 'sending' > 2 minutes)
        if (data.status === 'sending' && updatedAtMillis > 0 && (now - updatedAtMillis) > 120000) {
          console.warn(`Recovering stuck campaign ${d.id}`);
          updateDoc(doc(db, 'campaigns', d.id), {
            status: 'active',
            lastSendStatus: 'recovered_from_stuck_sending',
            lastSendError: 'Campanha recuperada automaticamente após timeout de envio',
            lastSendRecoveredAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updated_at: serverTimestamp()
          }).catch(console.error);
          return { id: d.id, ...data, status: 'active' };
        }
        
        return { id: d.id, ...data };
      });
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
    const isValidTargets = targets.length > 0 && targets.every(t => t.instance_id && t.group_id);
    
    if (!isValidTargets || !campaignName) {
      showError("Preencha todos os campos obrigatórios (Destino e Nome)");
      return;
    }

    if (messageMode === 'manual' && !message.trim()) {
      showError("A mensagem é obrigatória para o modo manual.");
      return;
    }

    if (messageMode === 'auto_offer') {
      if (!offerMarketplace) {
        showError("Selecione um marketplace para a oferta automática.");
        return;
      }
      if (!offerCategory) {
        showError("Selecione uma categoria para a oferta automática.");
        return;
      }
      // Assuming at least 1 global product always exists or will just fail later
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

    setIsSavingCampaign(true);
    
    const user = { uid: GLOBAL_USER_ID };
    if (!user) return;

    try {
        const payload: any = {
          name: campaignName,
          instance_id: targets[0].instance_id, 
          target_group_id: targets[0].group_id, 
          targets: targets,
          message: message,
          message_mode: messageMode,
          instruction_ia: instructionIA,
          auto_offer_config: messageMode === 'auto_offer' ? {
             marketplace: offerMarketplace,
             category: offerCategory,
             enabled: true
          } : null,
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
          send_interval: autoSendNow ? sendInterval : '',
          is_recurring: isRecurring,
          scheduled_days: scheduledDays,
          scheduled_times: scheduledTimes,
          scheduled_dates: scheduledDates,
        };

        console.log("CAMPAIGN_SAVE_PAYLOAD", payload);

        if (triggerType === 'scheduled' || autoSendNow) {
          payload.status = 'scheduled';
        }

        if (editingId) {
          await updateDoc(doc(db, 'campaigns', editingId), payload);
          console.log("CAMPAIGN_SAVE_SUCCESS", editingId);
        } else {
          const user = { uid: GLOBAL_USER_ID };
          if (!user) throw new Error("Usuário não autenticado");
          
          const newDoc = await addDoc(collection(db, 'campaigns'), {
            user_id: user.uid,
            created_at: serverTimestamp(),
            status: 'draft',
            ...payload,
          });
          console.log("CAMPAIGN_SAVE_SUCCESS", newDoc.id);
        }
        
        setTimeout(() => {
          setIsSavingCampaign(false);
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
          setMessageMode('manual');
          setScheduledDays([]);
          setScheduledTimes(['09:00']);
          setScheduledDates([]);
        }, 500);
    } catch(err: any) {
      console.error("Erro ao disparar campanha", err);
      showError(err.message || 'Erro ao salvar campanha');
      setIsSavingCampaign(false);
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

  const handleSendNow = async () => {
    console.log("SEND_NOW_CLICK");
    
    if (isSendingNow) return;
    
    console.log("SET_IS_SENDING_NOW_TRUE_SOURCE", "handleSendNow");
    setIsSendingNow(true);
    setErrorMsg('');
    
    try {
      console.log("SEND_NOW_START_WITH_SAVE_CHECK");
      
      const user = { uid: GLOBAL_USER_ID };
      if (!user) throw new Error("Usuário não autenticado");

      // Validations
      if (targets.some(t => !t.instance_id || !t.group_id)) {
        throw new Error("Selecione a instância e o alvo de envio corretamente.");
      }

      if (messageMode === 'manual' && !message) {
        throw new Error("Escreva a mensagem antes de disparar.");
      }

      // To follow "call the real function", we need an ID. 
      // If we don't have one, we MUST save it first as a draft.
      let campaignId = editingId;
      if (!campaignId) {
        console.log("SEND_NOW_AUTO_SAVE_NEW_CAMPAIGN");
        const newDoc = await addDoc(collection(db, 'campaigns'), {
          user_id: user.uid,
          created_at: serverTimestamp(),
          status: 'draft',
          name: campaignName,
          targets: targets,
          message: message,
          message_mode: messageMode,
          offer_category: offerCategory,
          offer_marketplace: offerMarketplace,
          updated_at: serverTimestamp()
        });
        campaignId = newDoc.id;
        setEditingId(campaignId);
      }

      // Now call the real trigger function which is handleTriggerCampaign
      // We pass the current state as "camp" object to ensure it uses the latest values from the form
      const currentCampState = {
        name: campaignName,
        targets: targets,
        message: message,
        message_mode: messageMode,
        offer_category: offerCategory,
        offer_marketplace: offerMarketplace,
        ai_tone: aiTone,
        image_url: imageUrl,
        use_ml_products: messageMode === 'auto_offer'
      };

      await handleTriggerCampaign(campaignId, currentCampState);
      
      showSuccess("Disparo manual realizado com sucesso!");
    } catch (err: any) {
      console.error("SEND_NOW_ERROR", err);
      alert(err?.message || "Erro ao disparar campanha");
      showError(err.message || "Erro ao realizar disparo manual");
    } finally {
      console.log("SET_IS_SENDING_NOW_FALSE_SOURCE", "finally/reset");
      setIsSendingNow(false);
    }
  };

  const handleEditCampaign = (camp: any) => {
    console.log("CAMPAIGN_EDIT_LOAD_START", camp.id);
    
    setEditingId(camp.id);
    setCampaignName(camp.name || '');
    if (camp.targets && camp.targets.length > 0) {
      setTargets(camp.targets);
    } else {
      setTargets([{ instance_id: camp.instance_id || '', group_id: camp.target_group_id || '' }]);
    }
    
    const mode = camp.message_mode || (camp.messageMode) || (camp.use_ml_products ? 'auto_offer' : 'manual');
    console.log("CAMPAIGN_EDIT_LOAD_RESULT", { mode, targetMessage: camp.message });
    setMessageMode(mode);
    setInstructionIA(camp.instruction_ia || '');
    
    const marketplace = camp.auto_offer_config?.marketplace || camp.offer_marketplace || 'all';
    const category = camp.auto_offer_config?.category || camp.offer_category || 'Todos';
    
    setOfferCategory(category);
    setOfferMarketplace(marketplace);
    
    console.log("CAMPAIGN_AUTO_OFFER_CONFIG_LOADED", { 
        category, 
        marketplace,
        mode
    });
    
    setAiTone(camp.ai_tone || 'Amigável');
    setPreviewProduct(null); 
    setMessage(camp.message || '');
    setImageUrl(camp.image_url || '');
    
    // Force reload marketplace status check early
    setMarketplacesLoaded(false);
    
    setTriggerType(camp.trigger_type === 'auto' ? 'manual' : (camp.trigger_type || 'manual'));
    setAutoSendNow(camp.auto_send_now || camp.trigger_type === 'auto' || false);
    setSendInterval(camp.send_interval || '00:00');
    setIsRecurring(camp.is_recurring || false);
    setScheduledDays(camp.scheduled_days || []);
    setScheduledTimes(camp.scheduled_times || ['09:00']);
    setScheduledDates(camp.scheduled_dates || []);
    
    setSelectedProductIds(Array.isArray(camp.ml_product_ids) ? camp.ml_product_ids : []);
    
    setIsCreating(true);
    setMarketplacesLoaded(false); // Force reload marketplace status check
    setIsSendingNow(false);
  };

  const handleTriggerCampaign = async (id: string, camp: any) => {
    if (loadingRowIds.has(id)) return;
    
    setLoadingRowIds(prev => new Set(prev).add(id));
    const previousStatus = camp.status || 'active';
    
    try {
      console.log("TRIGGER_CORE_JOB_START", id);
      const user = { uid: GLOBAL_USER_ID };
      if (!user) throw new Error("Usuário não autenticado.");

      const targetListRaw = (camp.targets && camp.targets.length > 0) 
        ? camp.targets 
        : [{ instance_id: camp.instance_id, group_id: camp.target_group_id }];
      
      const campaignInstanceId = camp.instance_id || '';
      const targetList = targetListRaw.map((t: any) => {
          const nt = normalizeTarget(t);
          if (!nt) return null;
          return {
              instance_id: t.instance_id || campaignInstanceId,
              group_id: nt.jid,
              name: nt.name
          };
      }).filter(Boolean);

      console.log("TRIGGER_TARGETS_NORMALIZED", { campaignId: id, count: targetList.length });

      const messageMode = camp.message_mode || (camp.messageMode) || (camp.use_ml_products ? 'auto_offer' : 'manual');

      // Check instance connection
      const firstTarget = targetList[0];
      if (!firstTarget || !firstTarget.instance_id) {
        throw new Error('Esta campanha não possui uma instância configurada.');
      }
      
      if (!firstTarget.group_id) {
        throw new Error('Nenhum grupo ou contato selecionado para esta campanha.');
      }

      try {
        const statusData = await fetchJson(`/api/whatsapp/status?instanceId=${firstTarget.instance_id}`);
        if (statusData.status !== 'connected') {
            throw new Error('O WhatsApp configurado não está conectado. Por favor, reconecte no menu Dispositivos.');
        }
      } catch (e: any) {
        if (e.message.includes('não está conectado')) throw e;
        console.warn('Erro ao verificar conexão do WhatsApp (prosseguindo):', e.message);
      }

      // Mark as sending with detailed metadata
      await updateDoc(doc(db, 'campaigns', id), {
        status: 'sending',
        lastSendStartedAt: serverTimestamp(),
        lastSendStatus: 'running',
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      
      const errors: string[] = [];
      const usedProductIds = new Set<string>();

      if (messageMode === 'auto_offer' && (!camp.offer_category || !camp.offer_marketplace)) {
         throw new Error("Configuração de Oferta Automática incompleta.");
      }

      for (const target of targetList) {
          if (!target || !target.group_id) {
             errors.push('Alvo da campanha sem group_id.');
             continue;
          }
          const jid = target.group_id.replace(`${target.instance_id}_`, '');
          try {
            const prepData = await fetchJson('/api/campaigns/prepare-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                campaignId: id, category: camp.offer_category, marketplace: camp.offer_marketplace || 'all',
                userId: user.uid, template: camp.message, tone: camp.ai_tone, messageMode,
                excludeProductIds: Array.from(usedProductIds)
              })
            });

            if (prepData.ok === false) {
                if (prepData.canSend === false) {
                    throw new Error(`Ação manual necessária: ${prepData.reasons?.join(', ') || 'Links afiliados pendentes'}`);
                }
                throw new Error(prepData.error || 'Falha ao preparar mensagem');
            }

            const finalMessage = prepData.message || "";
            // Strict Validation for remaining variables
            const remainingVars = finalMessage.match(/\{[a-zA-Z0-9_]+\}/);
            if (remainingVars) {
               throw new Error(`Erro ao montar mensagem: variáveis não substituídas (${remainingVars[0]}).`);
            }

            if (prepData.productId) usedProductIds.add(prepData.productId);

            // CREATE CAMPAIGN SEND JOB
            await addDoc(collection(db, 'campaign_send_jobs'), {
              campaignId: id,
              userId: user.uid,
              instanceId: target.instance_id,
              targetId: target.group_id,
              targetType: jid.includes('@g.us') ? 'group' : 'contact',
              targetName: target.name || jid,
              targetPhoneOrGroupId: jid,
              originalMessage: camp.message || '',
              finalMessage: finalMessage,
              imageUrl: prepData.imageUrl || camp.image_url || '',
              status: 'pending',
              attempts: 0,
              errorCode: null,
              errorMessage: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              sentAt: null
            });

          } catch (e: any) {
             errors.push(`Erro ${jid}: ${e.message}`);
             addDoc(collection(db, 'campaign_logs'), {
                  campaignId: id, productId: null, groupId: target.group_id, jid,
                  status: 'error', error: e.message, timestamp: serverTimestamp(), userId: user.uid, messageMode
             }).catch(console.error);
             if (e.message.includes("Todos os produtos desta categoria já foram enviados")) break;
          }
      }

      if (errors.length === targetList.length && targetList.length > 0) {
          throw new Error('Falha total na preparação dos envios: ' + errors[0]);
      }

      // Restore status based on rules
      let finalStatus = 'queued';

      await updateDoc(doc(db, 'campaigns', id), {
        status: finalStatus,
        lastSendStatus: 'success',
        lastSentAt: serverTimestamp(),
        lastSendFinishedAt: serverTimestamp(),
        lastSendError: null,
        last_run: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp()
      });

    } catch (e: any) {
      console.error("TRIGGER_CORE_JOB_ERROR", e);
      // Fail update
      await updateDoc(doc(db, 'campaigns', id), { 
        status: previousStatus || 'error',
        lastSendStatus: 'failed',
        lastSendError: e.message,
        lastSendFinishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp() 
      }).catch(console.error);
      throw e; 
    } finally {
      setLoadingRowIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (!isCreating) {
    return (
      <div className="page-content">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 className="page-title">Campanhas</h1>
              <p className="page-subtitle">Gerencie e dispare suas campanhas automatizadas de WhatsApp.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
              <Plus size={16} /> Nova Campanha
            </button>
          </div>
        </div>

        {/* Toasts */}
        {errorMsg && <div className="toast toast-error" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999 }}><AlertCircle size={18} className="toast-icon" /><span>{errorMsg}</span></div>}
        {successMsg && <div className="toast toast-success" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999 }}><CheckCircle2 size={18} className="toast-icon" /><span>{successMsg}</span></div>}

        {campaignsList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Megaphone size={28} /></div>
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Nenhuma campanha criada</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 380, marginBottom: 24 }}>Crie sua primeira campanha para disparar mensagens e aumentar suas vendas de forma automatizada.</p>
            <button className="btn btn-primary" onClick={() => setIsCreating(true)}><Plus size={16} /> Criar Primeira Campanha</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {campaignsList.map(camp => {
              const statusMap: Record<string, { label: string; cls: string }> = {
                sent: { label: 'Enviada', cls: 'badge-green' },
                failed: { label: 'Falhou', cls: 'badge-red' },
                paused: { label: 'Pausada', cls: 'badge-yellow' },
                needs_manual_action: { label: 'Ação Manual', cls: 'badge-yellow' },
                partially_sent: { label: 'Parcial', cls: 'badge-blue' },
                sending: { label: 'Enviando...', cls: 'badge-blue' },
                queued: { label: 'Na Fila', cls: 'badge-blue' },
                scheduled: { label: 'Ativa', cls: 'badge-green' },
                draft: { label: 'Rascunho', cls: 'badge-gray' },
              };
              const st = statusMap[camp.status] || { label: camp.status, cls: 'badge-gray' };
              const isAutoOrScheduled = camp.trigger_type === 'auto' || camp.trigger_type === 'scheduled';
              const isRunning = camp.status === 'scheduled';

              return (
                <div key={camp.id} className="campaign-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  {/* Icon */}
                  <div style={{
                    width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                    background: camp.message_mode === 'auto_offer' ? 'var(--green-glow)' : 'var(--bg-elevated)',
                    border: camp.message_mode === 'auto_offer' ? '1px solid var(--border-green)' : '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                  }}>
                    {camp.message_mode === 'auto_offer' ? '🤖' : '📢'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{camp.name}</h3>
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} /> {camp.created_at?.toDate()?.toLocaleDateString('pt-BR')}
                      </span>
                      {camp.trigger_type === 'scheduled' && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} /> às {camp.scheduled_times?.join(', ')}
                        </span>
                      )}
                      {camp.trigger_type === 'auto' && (
                        <span style={{ fontSize: 12, color: '#25D366', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Sparkles size={12} /> A cada {camp.send_interval}
                        </span>
                      )}
                      {camp.offer_category && (
                        <span style={{ fontSize: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '2px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {camp.offer_category}
                        </span>
                      )}
                    </div>
                    {camp.lastSendError && ['failed', 'needs_manual_action'].includes(camp.status) && (
                      <p style={{ fontSize: 12, color: '#f87171', marginTop: 6, background: 'rgba(239,68,68,0.08)', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' }}>
                        ⚠️ {camp.lastSendError}
                      </p>
                    )}
                    <AffiliateLinkResolverWidget campaign={camp} />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {isAutoOrScheduled ? (
                      <button
                        className={`btn btn-sm ${isRunning ? 'btn-danger' : 'btn-primary'}`}
                        onClick={() => handleTogglePause(camp.id, camp.status)}
                        style={{ minWidth: 120 }}
                      >
                        {isRunning ? <><Pause size={14} /> Parar</> : <><Play size={14} /> Ativar</>}
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleTriggerCampaign(camp.id, camp)}
                        disabled={loadingRowIds.has(camp.id) || camp.status === 'sending'}
                        style={{ minWidth: 120 }}
                      >
                        {(loadingRowIds.has(camp.id) || camp.status === 'sending')
                          ? <><Loader2 size={14} className="animate-spin" /> Enviando...</>
                          : <><Send size={14} /> Disparar</>}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleEditCampaign(camp)} title="Editar">
                      <Edit2 size={15} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeleteCampaign(camp.id)} title="Excluir" style={{ color: '#f87171' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title">{editingId ? 'Editar Campanha' : 'Nova Campanha'}</h1>
            <p className="page-subtitle">Configure a mensagem, os alvos e o agendamento.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={() => {
              setIsCreating(false); setEditingId(null); setIsSendingNow(false);
              setMessage(''); setImageUrl(''); setProductUrl('');
              setCampaignName('Promoção Relâmpago...'); setTriggerType('manual');
              setAutoSendNow(false); setSendInterval('00:00'); setIsRecurring(false);
              setMessageMode('manual'); setScheduledDays([]); setScheduledTimes(['09:00']);
            }}>Cancelar</button>
            <button type="button" className="btn btn-ghost" onClick={handleSendNow} disabled={isSendingNow}>
              {isSendingNow ? <><span className="spinner" style={{ borderTopColor: 'currentColor' }} /> Enviando...</> : <><Send size={15} /> Disparar Agora</>}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSend} disabled={isSavingCampaign}>
              {isSavingCampaign ? <><span className="spinner" style={{ borderTopColor: '#022c1a' }} /> Salvando...</> : 'Salvar Campanha'}
            </button>
          </div>
        </div>
      </div>

      {/* Toasts */}
      {errorMsg && <div className="toast toast-error"><AlertCircle size={18} className="toast-icon" /><span>{errorMsg}</span></div>}
      {successMsg && <div className="toast toast-success"><CheckCircle2 size={18} className="toast-icon" /><span>{successMsg}</span></div>}

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
        {/* Left: Configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Campaign Name */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24 }}>
            <label className="form-label">Nome da Campanha</label>
            <input
              type="text"
              className="form-input"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="Ex: Promoção de Eletrônicos"
            />
          </div>

          {/* Message Mode Toggle */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24 }}>
            <label className="form-label">Modo de Mensagem</label>
            <div className="tab-bar" style={{ marginBottom: 20 }}>
              <button
                className={`tab-item ${messageMode === 'manual' ? 'active' : ''}`}
                onClick={() => setMessageMode('manual')}
              >
                ✏️ Manual
              </button>
              <button
                className={`tab-item ${messageMode === 'auto_offer' ? 'active' : ''}`}
                onClick={() => {
                  const wasManual = messageMode === 'manual';
                  setMessageMode('auto_offer');
                  if (wasManual || !message || message.trim() === '' || message.includes('{Category}') || message.includes('{product_cupom}')) {
                    setMessage('⚡ {category} | {marketplace}\n\n🛍️ {product_title}\n\n🚫 {product_old_price}\n💲 {product_price}\n📉 {discountPercent}% OFF\n\n🎟️ {product_coupon}\n\n🛒 Comprar agora:\n{product_link}');
                  }
                }}
              >
                🤖 Oferta Automática
              </button>
            </div>

            {messageMode === 'auto_offer' && (
              <>
                {(!marketplacesLoaded || isCheckingIntegration) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border-subtle)', marginBottom: 16 }}>
                    <span className="spinner" />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando marketplaces conectados...</span>
                  </div>
                ) : (marketplaces.length === 0 || (marketplaces.length === 1 && marketplaces[0].id === 'mercadolivre_global' && offerMarketplace !== 'mercadolivre_global')) ? (
                  <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                    <AlertCircle size={24} style={{ color: '#f87171' }} />
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Conecte pelo menos um marketplace em Integrações para usar Oferta Automática.</p>
                    <button onClick={() => navigate('/integrations')} className="btn btn-primary btn-sm">Ir para Integrações</button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label className="form-label">Marketplace</label>
                      <select className="form-input form-select" value={offerMarketplace} onChange={e => setOfferMarketplace(e.target.value)}>
                        {marketplaces.length >= 2 && <option value="all">Todos</option>}
                        {!marketplaces.some((m: any) => m.id === 'mercadolivre_global') && (
                          <option value="mercadolivre_global">Mercado Livre (Banco Global)</option>
                        )}
                        {marketplaces.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Categoria</label>
                      <select className="form-input form-select" value={offerCategory} onChange={e => setOfferCategory(e.target.value)}>
                        {categories.length > 0 ? categories.map(c => <option key={c} value={c}>{c}</option>) : <option value="todos">Todos</option>}
                      </select>
                    </div>
                  </div>
                )}
                {marketplacesLoaded && !isCheckingIntegration && marketplaces.length > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--green)', lineHeight: 1.6, background: 'var(--green-glow)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-green)', marginBottom: 16 }}>
                    O sistema selecionará automaticamente ofertas de <strong>{offerMarketplace === 'all' ? 'todos os marketplaces conectados' : marketplaces.find((m: any) => m.id === offerMarketplace)?.name}</strong> na categoria <strong>{offerCategory}</strong>.
                  </p>
                )}
              </>
            )}

            {/* Template / Message */}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Mensagem / Template</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {messageMode === 'auto_offer' && (
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 12 }}
                        onClick={() => setShowVariableMenu(!showVariableMenu)}
                      >
                        {'{ }'} Variável
                      </button>
                      {showVariableMenu && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 240, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 20, padding: 8 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', padding: '4px 8px', marginBottom: 4 }}>Produto ML</p>
                          {[
                            { id: '{category}', label: 'Categoria' },
                            { id: '{marketplace}', label: 'Marketplace' },
                            { id: '{product_title}', label: 'Título' },
                            { id: '{product_price}', label: 'Preço atual' },
                            { id: '{product_old_price}', label: 'Preço antigo' },
                            { id: '{discountPercent}', label: 'Desconto' },
                            { id: '{product_coupon}', label: 'Cupom' },
                            { id: '{product_link}', label: 'Link' }
                          ].map(v => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => { setMessage(prev => prev + v.id); setShowVariableMenu(false); }}
                              style={{ width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 12, display: 'flex', justifyContent: 'space-between', borderRadius: 8, background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                            >
                              <span style={{ fontWeight: 500 }}>{v.label}</span>
                              <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{v.id}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 12 }}
                    onClick={() => setIsAiSectionOpen(!isAiSectionOpen)}
                  >
                    <Wand2 size={13} /> IA
                  </button>
                </div>
              </div>
              <textarea
                className="form-input form-textarea"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={messageMode === 'auto_offer'
                  ? '{product_title}\n{product_price} | {discountPercent}% OFF\n{product_link}'
                  : 'Sua mensagem aqui...'
                }
                rows={8}
              />
            </div>

            {/* AI Section */}
            {isAiSectionOpen && (
              <div style={{ marginTop: 16, background: 'var(--bg-surface)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Assistente IA</p>
                <div style={{ marginBottom: 12 }}>
                  <label className="form-label">Instruções para a IA</label>
                  <textarea
                    value={instructionIA}
                    onChange={e => setInstructionIA(e.target.value)}
                    placeholder="Ex: Transforme este texto em uma oferta irresistível com foco em urgência..."
                    rows={2}
                    className="form-input form-textarea"
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {[
                    { label: 'Melhorar Copy', action: 'Melhore este texto focando em conversão' },
                    { label: 'Criar Variações', action: 'Crie 3 variações curtas deste texto' },
                    { label: 'Mudar Tom', action: 'Mude o tom para ser mais engraçado e amigável' },
                    { label: 'Simplificar', action: 'Simplifique o texto para ser rápido de ler' },
                    { label: 'Persuadir', action: 'Torne o texto muito mais persuasivo' },
                    { label: 'Storytelling', action: 'Conte uma pequena história sobre o benefício deste produto' },
                  ].map(({ label, action }) => (
                    <button
                      key={label} type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={isAiGeneratingCopy}
                      onClick={() => handleAICalling(action)}
                      style={{ fontSize: 12 }}
                    >
                      {isAiGeneratingCopy ? <span className="spinner" /> : <Wand2 size={12} />}
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>IA alimentada por Gemini Flash 1.5</span>
                  <button
                    onClick={() => handleAICalling(instructionIA || 'Melhore meu copy')}
                    disabled={isAiGeneratingCopy || !message}
                    className="btn btn-primary btn-sm"
                  >
                    {isAiGeneratingCopy ? <><span className="spinner" style={{ borderTopColor: '#022c1a' }} /> Processando...</> : <><Sparkles size={13} /> Aplicar com IA</>}
                  </button>
                </div>

                {aiVariations && (
                  <div style={{ marginTop: 16, background: 'var(--bg-elevated)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Sugestões da IA</h4>
                      <button onClick={() => setAiVariations(null)} className="btn btn-ghost btn-icon btn-sm"><Trash2 size={13} /></button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {aiVariations.map((v, i) => (
                        <div key={i} style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 10, border: '1px solid var(--border-subtle)', position: 'relative' }}>
                          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, paddingRight: 32 }}>{v.text}</p>
                          <button
                            onClick={() => { setMessage(v.text); setAiVariations(null); }}
                            className="btn btn-ghost btn-icon btn-sm"
                            style={{ position: 'absolute', top: 8, right: 8 }}
                            title="Usar esta variação"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Image URL */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24 }}>
            <label className="form-label">URL da Imagem (opcional)</label>
            <input
              type="url"
              className="form-input"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          {/* Target: Instance & Group */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Destinos de Envio</label>
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}
                onClick={() => setTargets(prev => [...prev, { instance_id: '', group_id: '' }])}
              >
                <Plus size={13} /> Adicionar
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {targets.map((target, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'center' }}>
                  <select
                    className="form-input form-select"
                    style={{ fontSize: 13 }}
                    value={target.instance_id}
                    onChange={e => {
                      const newTargets = [...targets];
                      newTargets[idx].instance_id = e.target.value;
                      newTargets[idx].group_id = '';
                      setTargets(newTargets);
                    }}
                  >
                    <option value="">WhatsApp...</option>
                    {instances.map((inst: any) => (
                      <option key={inst.id} value={inst.id}>{inst.instance_name || inst.id}</option>
                    ))}
                  </select>
                  <select
                    className="form-input form-select"
                    style={{ fontSize: 13 }}
                    value={target.group_id}
                    onChange={e => {
                      const newTargets = [...targets];
                      newTargets[idx].group_id = e.target.value;
                      setTargets(newTargets);
                    }}
                    disabled={!target.instance_id}
                  >
                    {target.instance_id ? (
                      <>
                        <option value="">Grupo/Contato...</option>
                        {groups.filter((g: any) => g.id.startsWith(target.instance_id + '_')).map((g: any) => (
                          <option key={g.id} value={g.id}>{g.name} ({g.type === 'group' ? 'Grupo' : 'Contato'})</option>
                        ))}
                      </>
                    ) : (
                      <option value="" disabled>Selecione a instância primeiro...</option>
                    )}
                  </select>
                  {targets.length > 1 && (
                    <button type="button" className="btn btn-danger btn-icon btn-sm"
                      onClick={() => setTargets(targets.filter((_, i) => i !== idx))}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scheduling */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif' }}>⏱️ Configuração de Disparo</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Defina quando e como a campanha será enviada</p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Disparo Contínuo</span>
                <div style={{ position: 'relative' }}>
                  <input type="checkbox" style={{ display: 'none' }} checked={autoSendNow} onChange={e => setAutoSendNow(e.target.checked)} />
                  <div onClick={() => setAutoSendNow(!autoSendNow)} style={{
                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                    background: autoSendNow ? 'var(--green)' : 'var(--bg-elevated)',
                    border: '1px solid ' + (autoSendNow ? 'var(--border-green)' : 'var(--border-medium)'),
                    position: 'relative', transition: 'all 0.2s'
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: autoSendNow ? 22 : 3,
                      width: 16, height: 16, borderRadius: '50%',
                      background: autoSendNow ? '#022c1a' : 'var(--text-muted)',
                      transition: 'left 0.2s'
                    }} />
                  </div>
                </div>
              </label>
            </div>

            {autoSendNow ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="form-label">Intervalo entre Envios (MM:SS)</label>
                  <input
                    type="text" className="form-input"
                    style={{ maxWidth: 140, fontFamily: 'monospace' }}
                    value={sendInterval}
                    onChange={e => setSendInterval(e.target.value)}
                    placeholder="01:00"
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>00:30 = 30s, 01:00 = 1min, 60:00 = 1h</p>
                </div>
                <div style={{ background: 'var(--green-glow)', border: '1px solid var(--border-green)', borderRadius: 10, padding: 12 }}>
                  <p style={{ fontSize: 12, color: 'var(--green)', lineHeight: 1.6 }}>
                    <strong>Modo Contínuo Ativo:</strong> A campanha enviará mensagens automaticamente no intervalo definido, selecionando produtos variados do Banco de Ofertas.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="tab-bar" style={{ marginBottom: 16 }}>
                  <button className={`tab-item ${triggerType === 'manual' ? 'active' : ''}`} onClick={() => setTriggerType('manual')}>Manual</button>
                  <button className={`tab-item ${triggerType === 'scheduled' ? 'active' : ''}`} onClick={() => setTriggerType('scheduled')}>Agendado</button>
                </div>

                {triggerType === 'scheduled' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input type="checkbox" id="recurring" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} style={{ accentColor: 'var(--green)', width: 16, height: 16 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Recorrente (repetir semanalmente)</span>
                    </label>

                    <div>
                      <label className="form-label">Dias da Semana</label>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {DAYS.map(d => (
                          <button
                            key={d.value}
                            type="button"
                            className={`chip ${scheduledDays.includes(d.value) ? 'selected' : ''}`}
                            onClick={() => setScheduledDays(prev => prev.includes(d.value) ? prev.filter(x => x !== d.value) : [...prev, d.value])}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Datas Específicas</label>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input
                          type="date"
                          value={newDate}
                          onChange={e => setNewDate(e.target.value)}
                          className="form-input"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            if (newDate && !scheduledDates.includes(newDate)) {
                              setScheduledDates([...scheduledDates, newDate]);
                              setNewDate('');
                            }
                          }}
                        >Add</button>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {scheduledDates.map(date => (
                          <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--green-glow)', border: '1px solid var(--border-green)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: 'var(--green)' }}>
                            {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')}
                            <button type="button" onClick={() => setScheduledDates(scheduledDates.filter(d => d !== date))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', lineHeight: 1 }}>
                              <Plus size={11} style={{ transform: 'rotate(45deg)' }} />
                            </button>
                          </div>
                        ))}
                        {scheduledDates.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhuma data selecionada</p>}
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Horários</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        {scheduledTimes.map((t, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="time" className="form-input"
                              style={{ width: 'auto', padding: '8px 10px', fontSize: 13 }}
                              value={t}
                              onChange={e => {
                                const newTimes = [...scheduledTimes];
                                newTimes[i] = e.target.value;
                                setScheduledTimes(newTimes);
                              }}
                            />
                            {scheduledTimes.length > 1 && (
                              <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ color: '#f87171' }}
                                onClick={() => setScheduledTimes(scheduledTimes.filter((_, j) => j !== i))}>
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}
                        onClick={() => setScheduledTimes(prev => [...prev, '09:00'])}>
                        <Plus size={12} /> Adicionar Horário
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: WhatsApp Preview */}
        <div style={{ position: 'sticky', top: 24 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 20, padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', marginBottom: 16, textAlign: 'center' }}>Preview WhatsApp</p>
            <PhonePreview
              message={message}
              imageUrl={imageUrl}
              dummyProduct={messageMode === 'auto_offer' ? (isGeneratingPreview ? { ...previewProduct, product_link: 'Convertendo link afiliado...', product_affiliate_link: 'Convertendo link afiliado...' } : previewProduct) : (products.length > 0 ? products[0] : null)}
            />
            {(() => {
              const prod = messageMode === 'auto_offer' ? previewProduct : (products.length > 0 ? products[0] : null);
              if (!isGeneratingPreview && prod?.affiliatePending) {
                return (
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 10, padding: 10, fontSize: 12, color: '#ca8a04' }}>
                    <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <p>Link afiliado pendente. O disparo usará os conversores configurados ou aguardará ação manual.</p>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}