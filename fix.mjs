import fs from 'fs';
let content = fs.readFileSync('src/pages/Campaigns.tsx', 'utf-8');
const search = `                        </select>
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
                    
                    <p className="text-[11px] text-indigo-600/70 mt-2 leading-relaxed bg-white/60 p-3 rounded-lg border border-indigo-100/50">`;
const replacement = `                        </select>
                      </div>
                    </div>
                    
                    <p className="text-[11px] text-indigo-600/70 mt-2 leading-relaxed bg-white/60 p-3 rounded-lg border border-indigo-100/50">`;
const replaced = content.replace(search, replacement);
if (content !== replaced) {
    fs.writeFileSync('src/pages/Campaigns.tsx', replaced);
    console.log("Replaced!");
} else {
    console.log("Not found.");
}
