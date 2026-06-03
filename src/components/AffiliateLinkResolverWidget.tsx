import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth, GLOBAL_USER_ID } from '../lib/firebase.js';
import { MarketplaceDetector } from '../lib/affiliate/marketplace-detector.js';
import { Search, Link, Check, ExternalLink, RefreshCw } from 'lucide-react';

export function AffiliateLinkResolverWidget({ campaign, onResolved }: { campaign: any, onResolved?: () => void }) {
    const [originalUrl, setOriginalUrl] = useState<string | null>(null);
    const [job, setJob] = useState<any>(null);
    const [manualLink, setManualLink] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [provider, setProvider] = useState<string>('unknown');

    // Extract first valid marketplace URL
    useEffect(() => {
        if (!campaign.message) return;
        const urlRegex = /https?:\/\/[^\s\*\~_|\\<\\>"]+/g;
        const matches = campaign.message.match(urlRegex) || [];
        const uniqueLinks: string[] = Array.from(new Set(matches)) as string[];
        
        let foundUrl: string | null = null;
        let foundProvider = 'unknown';

        for (const url of uniqueLinks) {
            const p = MarketplaceDetector.detect(url);
            if (p !== 'unknown') {
                const isAlreadyAffiliate = 
                    (p === 'mercadolivre' && (url.includes('/sec/') || url.includes('afiliados'))) ||
                    (p === 'amazon' && url.includes('amzn.to')) ||
                    (p === 'shopee' && url.includes('shope.ee'));
                    
                if (!isAlreadyAffiliate) {
                    foundUrl = url;
                    foundProvider = p;
                    break; // Just use the first one for the widget
                }
            }
        }

        setOriginalUrl(foundUrl);
        setProvider(foundProvider);
    }, [campaign.message]);

    // Listen to job status
    useEffect(() => {
        if (!originalUrl) return;

        const q = query(
            collection(db, 'affiliate_link_jobs'),
            where('originalUrl', '==', originalUrl)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                // sort by createdAt desc
                const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
                docs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
                setJob(docs[0]);
            } else {
                setJob(null);
            }
        });

        return () => unsubscribe();
    }, [originalUrl]);

    if (!originalUrl) return null;

    const requiresAction = campaign.last_run_message?.includes('ainda não possui link afiliado') || campaign.status === 'needs_manual_action';
    if (!requiresAction && job?.status === 'success') {
        // We might just show a minimal success state
        return null; // For now hide if not required
    }
    if (!requiresAction && job == null) {
        return null;
    }

    const handleGenerate = async () => {
        if (!originalUrl) return;
        setIsLoading(true);
        try {
            let affiliateUrl = '';
            let method = 'api';
            let success = false;
            let errorMsg = '';

            if (provider === 'mercadolivre') {
                const res = await fetch('/api/integrations/mercadolivre/convert-affiliate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: originalUrl, uid: GLOBAL_USER_ID })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.ok && data.affiliateUrl && data.method !== 'fallback') {
                        affiliateUrl = data.affiliateUrl;
                        method = data.method;
                        success = true;
                    } else {
                        errorMsg = data.error || 'Conversão retornou link original (sem integração ou tag válida).';
                    }
                } else {
                    errorMsg = 'Erro na resposta do servidor.';
                }
            } else if (provider === 'shopee') {
                const res = await fetch('/api/shopee/generate-affiliate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: GLOBAL_USER_ID, productUrl: originalUrl })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.ok && data.affiliate_link && !data.affiliate_link.includes(originalUrl)) {
                        affiliateUrl = data.affiliate_link;
                        success = true;
                    } else {
                        errorMsg = data.error || 'Erro ao gerar link de afiliado da Shopee.';
                    }
                } else {
                    errorMsg = 'Erro na resposta do servidor.';
                }
            } else {
                errorMsg = 'Plataforma não suportada para conversão automática.';
            }

            if (success && affiliateUrl) {
                // Save success job in firestore
                if (job) {
                    await updateDoc(doc(db, 'affiliate_link_jobs', job.id), {
                        affiliateUrl: affiliateUrl,
                        status: 'success',
                        method: method,
                        updatedAt: serverTimestamp(),
                        errorCode: null,
                        errorMessage: null,
                        error: null
                    });
                } else {
                    await addDoc(collection(db, 'affiliate_link_jobs'), {
                        originalUrl,
                        provider,
                        affiliateUrl: affiliateUrl,
                        status: 'success',
                        method: method,
                        userId: GLOBAL_USER_ID,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        errorCode: null,
                        errorMessage: null
                    });
                }
                
                await addDoc(collection(db, 'affiliate_link_conversion_logs'), {
                    userId: GLOBAL_USER_ID,
                    originalUrl,
                    affiliateUrl: affiliateUrl,
                    method: method,
                    provider,
                    createdAt: serverTimestamp(),
                    message: "Link de afiliado gerado com sucesso sob demanda."
                });

                if (onResolved) onResolved();
            } else {
                // Save failed job in firestore
                if (job) {
                    await updateDoc(doc(db, 'affiliate_link_jobs', job.id), {
                        status: 'needs_manual_action',
                        method: 'api',
                        updatedAt: serverTimestamp(),
                        errorCode: 'CONVERSION_FAILED',
                        errorMessage: errorMsg
                    });
                } else {
                    await addDoc(collection(db, 'affiliate_link_jobs'), {
                        originalUrl,
                        provider,
                        status: 'needs_manual_action',
                        method: 'api',
                        userId: GLOBAL_USER_ID,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        errorCode: 'CONVERSION_FAILED',
                        errorMessage: errorMsg
                    });
                }
            }
        } catch (e: any) {
            console.error(e);
            // Save failed job in firestore
            if (job) {
                await updateDoc(doc(db, 'affiliate_link_jobs', job.id), {
                    status: 'needs_manual_action',
                    method: 'api',
                    updatedAt: serverTimestamp(),
                    errorCode: 'CONVERSION_ERROR',
                    errorMessage: e.message || String(e)
                });
            } else {
                await addDoc(collection(db, 'affiliate_link_jobs'), {
                    originalUrl,
                    provider,
                    status: 'needs_manual_action',
                    method: 'api',
                    userId: GLOBAL_USER_ID,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    errorCode: 'CONVERSION_ERROR',
                    errorMessage: e.message || String(e)
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveManual = async () => {
        if (!manualLink || !manualLink.startsWith('http') || !originalUrl) return;
        setIsLoading(true);
        try {
            if (job) {
                await updateDoc(doc(db, 'affiliate_link_jobs', job.id), {
                    affiliateUrl: manualLink.trim(),
                    status: 'success',
                    method: 'manual',
                    updatedAt: serverTimestamp(),
                    errorCode: null,
                    errorMessage: null,
                    error: null
                });
                
                await addDoc(collection(db, 'affiliate_link_conversion_logs'), {
                    jobId: job.id,
                    userId: GLOBAL_USER_ID,
                    originalUrl,
                    affiliateUrl: manualLink.trim(),
                    method: 'manual',
                    provider,
                    createdAt: serverTimestamp(),
                    message: "Link afiliado salvo manualmente"
                });
            } else {
                const jRef = await addDoc(collection(db, 'affiliate_link_jobs'), {
                    originalUrl,
                    provider,
                    affiliateUrl: manualLink.trim(),
                    status: 'success',
                    method: 'manual',
                    userId: GLOBAL_USER_ID,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    errorCode: null,
                    errorMessage: null
                });
                
                await addDoc(collection(db, 'affiliate_link_conversion_logs'), {
                    jobId: jRef.id,
                    userId: GLOBAL_USER_ID,
                    originalUrl,
                    affiliateUrl: manualLink.trim(),
                    method: 'manual',
                    provider,
                    createdAt: serverTimestamp(),
                    message: "Link afiliado salvo manualmente"
                });
            }

            setManualLink('');
            if (onResolved) onResolved();
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const isPending = job?.status === 'pending' || job?.status === 'processing';
    const isSuccess = job?.status === 'success';
    const isError = job?.status === 'error' || job?.status === 'needs_manual_action';

    useEffect(() => {
        if (isSuccess && job?.affiliateUrl && originalUrl && campaign) {
            // Only update if it still has the alert/status
            if (campaign.last_run_message || ['failed', 'needs_manual_action'].includes(campaign.status)) {
                const timer = setTimeout(() => {
                    const newMessage = campaign.message.split(originalUrl).join(job.affiliateUrl.trim());
                    updateDoc(doc(db, 'campaigns', campaign.id), {
                        message: newMessage,
                        last_run_message: null,
                        status: 'ready_to_send',
                        updated_at: serverTimestamp()
                    }).catch(console.error);
                }, 3000);
                return () => clearTimeout(timer);
            }
        }
    }, [isSuccess, job, campaign, originalUrl]);

    return (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 font-semibold text-gray-700 text-[13px] flex items-center justify-between">
                <span>Resolver link afiliado</span>
                {isPending && <span className="flex items-center text-blue-600 text-[12px]"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Processando...</span>}
                {isSuccess && <span className="flex items-center text-green-600 text-[12px]"><Check className="w-3 h-3 mr-1" />Resolvido</span>}
            </div>
            
            <div className="p-4 space-y-4">
                <div className="text-[12px] text-gray-700 mb-2">Este produto precisa de um link afiliado antes do disparo.</div>
                <div className="text-[12px]">
                    <div className="flex flex-col gap-1">
                        <span className="font-semibold text-gray-600">Link Original Detectado:</span>
                        <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all truncate block">{originalUrl}</a>
                    </div>
                </div>

                {isSuccess && job?.affiliateUrl ? (
                    <>
                        <div className="text-[12px] bg-green-50 p-2 rounded-lg border border-green-100">
                            <span className="font-semibold text-green-700 block mb-1">Link Afiliado Salvo:</span>
                            <a href={job.affiliateUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline break-all block">{job.affiliateUrl}</a>
                        </div>
                        <div className="text-[12px] bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <span className="font-semibold text-gray-700 block mb-2">Preview da Mensagem Final:</span>
                            <div className="whitespace-pre-wrap text-gray-600 font-mono text-[11px]">{campaign.message.split(originalUrl).join(job.affiliateUrl)}</div>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <button
                                onClick={handleGenerate}
                                disabled={isLoading || isPending}
                                className="flex-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 py-2 px-3 rounded-lg text-[13px] font-medium transition-colors flex justify-center items-center"
                            >
                                {isPending ? (
                                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Processando conversão...</>
                                ) : (
                                    <><Search className="w-4 h-4 mr-2" /> Tentar gerar automaticamente</>
                                )}
                            </button>
                            <button
                                onClick={() => { setJob({...job}) }}
                                disabled={!job}
                                className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 py-2 px-3 rounded-lg text-[13px] font-medium transition-colors flex justify-center items-center whitespace-nowrap"
                            >
                                Ver status da conversão
                            </button>
                        </div>

                        {isError && (
                            <div className="text-[12px] text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                                <strong>Erro na conversão automática: </strong> 
                                {job?.errorMessage || job?.error || "Gerador automático ainda não configurado ou falha na conversão. Cole o link afiliado manualmente."}
                            </div>
                        )}

                        <div className="flex gap-2 items-center">
                            <input
                                type="url"
                                placeholder="Cole aqui o link afiliado do Mercado Livre"
                                value={manualLink}
                                onChange={(e) => setManualLink(e.target.value)}
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <button
                                onClick={handleSaveManual}
                                disabled={isLoading || !manualLink}
                                className="bg-gray-800 text-white disabled:opacity-50 py-2 px-4 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap"
                            >
                                Salvar link afiliado
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
