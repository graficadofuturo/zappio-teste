"use client";

import React from "react";

export default function AdminPlaywrightSessionsPage() {
  const marketplaces = [
    { id: "mercadolivre", name: "Mercado Livre", status: "checking" },
    { id: "amazon", name: "Amazon", status: "checking" },
    { id: "shopee", name: "Shopee", status: "checking" }
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto font-sans">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Admin: Sessões do Playwright</h1>
      <p className="mb-8 text-gray-600">
        Gerencie as sessões de navegador (cookies e logins) utilizadas na conversão automática de links. 
        Se o robô pedir "Ação Manual", você pode precisar logar nestas contas via servidor.
      </p>

      <div className="space-y-6">
        {marketplaces.map((mp) => (
          <div key={mp.id} className="p-6 bg-white shadow rounded border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold capitalize">{mp.name}</h2>
            </div>
            
            <p className="text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded">
              Diretório local: <code>./storage/playwright/{mp.id}</code>
            </p>

            <div className="flex gap-3">
              <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                Testar Sessão
              </button>
              <button className="bg-red-50 text-red-600 px-4 py-2 rounded text-sm hover:bg-red-100 border border-red-200">
                Resetar Sessão (Limpar Cookies)
              </button>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold mb-2 text-gray-800">Instruções para Login Manual</h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Em ambiente de produção remoto (Cloud Run, Vercel, etc), o login interativo headless não é viável. 
                Para injetar uma sessão válida, você deve abrir um terminal na máquina e iniciar o Chromium não-headless 
                usando o path de <code>userDataDir</code> deste marketplace, realizar o login com o seu usuário e senha e 
                fechar o navegador. Os cookies serão armazenados neste diretório para uso do Worker em background.
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
