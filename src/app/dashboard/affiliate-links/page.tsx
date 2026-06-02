"use client";

import React, { useState, useEffect } from "react";
import {
  createAffiliateLinkJob,
  listAffiliateLinkJobs,
  retryAffiliateLinkJob,
  saveManualAffiliateUrl
} from "./actions";

export default function AffiliateLinksPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [originalUrl, setOriginalUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    const res = await listAffiliateLinkJobs();
    if (res.success) {
      setJobs(res.jobs || []);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await createAffiliateLinkJob(originalUrl);
    if (!res.success) {
      setError(res.error || "An unknown error occurred");
    } else {
      setOriginalUrl("");
      fetchJobs();
    }
    setLoading(false);
  };

  const handleRetry = async (jobId: string) => {
    await retryAffiliateLinkJob(jobId);
    fetchJobs();
  };

  const handleManualSave = async (jobId: string, affiliateUrl: string) => {
    if (!affiliateUrl) return;
    await saveManualAffiliateUrl(jobId, affiliateUrl);
    fetchJobs();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copiado!");
  };

  return (
    <div className="p-8 max-w-5xl mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-6">Conversor de Links Afiliados</h1>

      <form onSubmit={handleCreate} className="mb-10 p-6 bg-white shadow rounded-lg border border-gray-100">
        <label className="block text-sm font-medium text-gray-700 mb-2">Colar Link Original</label>
        <div className="flex gap-4">
          <input
            type="url"
            required
            placeholder="https://produto.mercadolivre.com.br/..."
            className="flex-1 p-3 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={originalUrl}
            onChange={(e) => setOriginalUrl(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Processando..." : "Converter Link"}
          </button>
        </div>
        {error && <p className="text-red-500 mt-3 text-sm">{error}</p>}
      </form>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Conversões Recentes</h2>
        <button onClick={fetchJobs} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          Atualizar Lista
        </button>
      </div>

      <div className="space-y-4">
        {jobs.length === 0 && <p className="text-gray-500 text-center py-10">Nenhum link convertido ainda.</p>}
        {jobs.map((job) => (
          <JobCard 
            key={job.id} 
            job={job} 
            onRetry={() => handleRetry(job.id)} 
            onManualSave={(url) => handleManualSave(job.id, url)} 
            onCopy={() => copyToClipboard(job.affiliateUrl)}
          />
        ))}
      </div>
    </div>
  );
}

function JobCard({ job, onRetry, onManualSave, onCopy }: { job: any, onRetry: () => void, onManualSave: (url: string) => void, onCopy: () => void }) {
  const [manualUrl, setManualUrl] = useState("");

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    success: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    needs_manual_action: "bg-orange-100 text-orange-800"
  };

  return (
    <div className="p-5 bg-white border border-gray-200 shadow-sm rounded flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1 overflow-hidden">
          <span className={`text-xs font-semibold px-2 py-1 rounded w-max ${statusColors[job.status] || "bg-gray-100 text-gray-800"}`}>
            {(job.status || "UNKNOWN").toUpperCase()}
          </span>
          <span className="text-sm font-medium text-gray-600 truncate uppercase mt-1">
            Provider: {job.provider}
          </span>
          <a href={job.originalUrl} target="_blank" className="text-sm text-blue-500 hover:underline truncate" title={job.originalUrl}>
            Original: {job.originalUrl}
          </a>
        </div>
      </div>

      {job.status === "success" && (
        <div className="mt-2 flex gap-3 items-center bg-gray-50 p-3 rounded border border-gray-100">
          <input 
            type="text" 
            readOnly 
            value={job.affiliateUrl || ""} 
            className="flex-1 bg-transparent text-sm outline-none font-mono text-gray-800" 
          />
          <button 
            onClick={onCopy}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm font-medium"
          >
            Copiar
          </button>
        </div>
      )}

      {job.status === "needs_manual_action" && (
        <div className="mt-2 bg-orange-50 border border-orange-200 p-4 rounded text-sm">
          <p className="text-orange-800 font-medium mb-3">
            Ação Manual Necessária. Erro: {job.errorMessage || job.errorCode}
          </p>
          <div className="flex gap-3">
            <input 
              type="url" 
              placeholder="Cole seu link de afiliado final aqui" 
              className="flex-1 p-2 border border-gray-300 rounded focus:ring-orange-500 outline-none"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
            />
            <button 
              onClick={() => onManualSave(manualUrl)}
              className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 font-medium whitespace-nowrap"
            >
              Salvar Manual
            </button>
            {job.provider !== "unknown" && (
              <button onClick={onRetry} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded text-gray-700 font-medium">
                Tentar Auto
              </button>
            )}
          </div>
        </div>
      )}

      {job.status === "failed" && (
        <div className="mt-2 text-sm text-red-600 flex justify-between items-center">
          <span>Erro: {job.errorMessage || "Desconhecido"}</span>
          <button onClick={onRetry} className="bg-red-50 text-red-700 border border-red-200 rounded px-3 py-1 hover:bg-red-100">
            Tentar Novamente
          </button>
        </div>
      )}
    </div>
  );
}
