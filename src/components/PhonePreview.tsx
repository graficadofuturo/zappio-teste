import { cn } from '../lib/utils';
import { ShieldCheck, MoreVertical, Paperclip, Send, Camera, ArrowLeft, Phone, Video, Smile, Mic, Lock } from 'lucide-react';

interface PhonePreviewProps {
  message: string;
  imageUrl?: string;
  dummyProduct?: any;
}

const DEFAULT_DUMMY_PRODUCT = {
  product_title: 'Smart TV 55" 4K',
  product_price: '3500.00',
  product_old_price: '2999.00',
  product_discount: '14%',
  product_link: 'https://exemplo.com/p/tv55',
  product_affiliate_link: 'https://exemplo.com/aff/tv55',
  product_image: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&q=80&w=800'
};

export default function PhonePreview({ message, imageUrl, dummyProduct }: PhonePreviewProps) {
  const prod = dummyProduct || DEFAULT_DUMMY_PRODUCT;

  // Format message to simulate WhatsApp text formatting (*bold*, _italic_, ~strikethrough~)
  const formatText = (text: string) => {
    if (!text) return '';
    
    // Replace variables in preview
    let replacedText = text;
    if (replacedText.includes('{')) {
      replacedText = replacedText.replace(/{product_title}/g, prod.product_title || '');
      replacedText = replacedText.replace(/{product_price}/g, prod.product_price ? `R$ ${Number(prod.product_price).toFixed(2).replace('.', ',')}` : '');
      replacedText = replacedText.replace(/{product_old_price}/g, prod.product_old_price ? `~R$ ${Number(prod.product_old_price).toFixed(2).replace('.', ',')}~` : '');
      replacedText = replacedText.replace(/{product_discount}/g, prod.product_discount || '');
      replacedText = replacedText.replace(/{product_link}/g, prod.product_link || '');
      replacedText = replacedText.replace(/{product_affiliate_link}/g, prod.product_affiliate_link || prod.product_link || '');
      replacedText = replacedText.replace(/{product_image}/g, prod.product_image || '');
      replacedText = replacedText.replace(/{product_category}/g, prod.product_category || '');
      replacedText = replacedText.replace(/{product_store}/g, prod.product_store || '');
      replacedText = replacedText.replace(/{product_stock}/g, prod.product_stock || '');
      replacedText = replacedText.replace(/{product_id}/g, prod.external_product_id || prod.id || '');
      replacedText = replacedText.replace(/{product_cupom}/g, prod.product_cupom || '');
      
      // Fix common typo
      replacedText = replacedText.replace(/{product_tittle}/g, prod.product_title || '');
      
      // Clean up unreplaced and empty lines
      const lines = replacedText.split('\n');
      const cleanLines = lines.map(l => l.replace(/{[^{}]+}/g, '').trim()).filter(l => l !== '');
      replacedText = cleanLines.join('\n');
    }

    return replacedText.split('\n').map((line, i) => (
      <span key={i} className="block min-h-[20px]">
        {line}
      </span>
    ));
  };

  // Preview handles dynamic image URL if passed via variable too
  let finalImageUrl = imageUrl || '';
  if (finalImageUrl.includes('{product_image}')) {
      finalImageUrl = finalImageUrl.replace(/{product_image}/g, prod.product_image || '');
  } else if (!finalImageUrl && message.includes('{product_image}')) {
      finalImageUrl = prod.product_image || '';
  }

  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="w-[340px] h-[680px] bg-black rounded-[46px] p-[8px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] mx-auto relative flex flex-col scale-90 sm:scale-100 origin-top shrink-0 ring-1 ring-black/10">
      {/* Notch */}
      <div className="absolute top-[8px] left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-black rounded-b-[20px] z-20"></div>

      <div className="w-full h-full bg-[#EFEAE2] rounded-[38px] overflow-hidden flex flex-col relative">
        {/* WhatsApp Pattern Background (subtle) */}
        <div className="absolute inset-0 opacity-[0.4] pointer-events-none" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: '400px' }}></div>

        {/* WhatsApp Header Android Style */}
        <div className="h-[60px] bg-[#008069] text-white flex items-center px-2 shrink-0 z-10 shadow-sm relative pt-2">
          <div className="flex items-center gap-1 flex-1">
            <button className="flex items-center p-1 rounded-full hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
              <div className="w-9 h-9 bg-[#dfe5e7] rounded-full overflow-hidden ml-1 border border-white/20">
                <svg viewBox="0 0 24 24" className="w-full h-full text-white bg-[#b3c1c4]"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
              </div>
            </button>
            <div className="flex flex-col ml-1 cursor-pointer">
              <span className="font-semibold text-[15px] leading-tight">Cliente</span>
              <span className="text-[12px] text-white/80 leading-tight">online</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-white px-2">
            <Video className="w-5 h-5 fill-current" />
            <Phone className="w-5 h-5 fill-current" />
            <MoreVertical className="w-5 h-5" />
          </div>
        </div>

        {/* Chat Background */}
        <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto custom-scrollbar relative z-10 pt-4 pb-[30px]">
          
          {/* Date Label */}
          <div className="flex justify-center mb-1 drop-shadow-sm">
            <span className="bg-white/95 text-[#54656f] text-[11px] px-3 py-1 rounded-lg uppercase tracking-wider font-medium">Hoje</span>
          </div>

          {/* Secure Label */}
          <div className="flex justify-center mb-3">
             <div className="bg-[#FFEECD] text-[#54656f] text-[11px] px-3 py-1.5 rounded-lg text-center shadow-sm max-w-[90%] leading-relaxed flex items-center justify-center gap-1.5">
               <Lock className="w-3 h-3 shrink-0" />
               <span>As mensagens são protegidas de ponta a ponta.</span>
             </div>
          </div>

          {/* Message Bubble */}
          <div className="max-w-[85%] p-1 rounded-[10px] rounded-tr-none text-[14px] leading-[1.35] relative self-end bg-[#d9fdd3] shadow-sm text-[#111b21] mb-2 drop-shadow-sm">
            {/* Bubble Tail */}
            <svg viewBox="0 0 8 13" className="absolute top-0 -right-[8px] text-[#d9fdd3] fill-current drop-shadow-sm" width="8" height="13">
              <path opacity=".13" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
              <path fill="currentColor" d="M5.188 0H0v11.193l6.467-8.625C7.526 1.156 6.958 0 5.188 0z"></path>
            </svg>

            {finalImageUrl && (
               <div className="w-full aspect-square sm:aspect-auto sm:max-h-[220px] bg-[#eee] rounded-[6px] mb-1 overflow-hidden flex items-center justify-center border border-black/5">
                 <img src={finalImageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
               </div>
            )}
            
            <div className={cn("px-1.5 pb-4 pt-1", !finalImageUrl && "px-2 pt-1.5")} style={{ fontFamily: 'var(--font-sans)', WebkitFontSmoothing: 'antialiased' }}>
              <div className="whitespace-pre-wrap break-words">
                {message ? formatText(message) : <span className="text-gray-400 italic">Sua mensagem aparecerá aqui...</span>}
              </div>
            </div>
            
            {/* Meta (Time + Ticks) */}
            <div className="absolute bottom-1 right-2 flex items-center gap-1 z-10 bg-[#d9fdd3] pl-1 rounded-bl-sm border-t border-[#d9fdd3]">
              <span className="text-[10px] text-[#667781] leading-none mb-[1px] font-medium">{time}</span>
              <svg viewBox="0 0 16 15" width="16" height="15" className="text-[#53bdeb] fill-current">
                <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="h-[64px] bg-[#f0f2f5] p-2 flex items-center gap-2 shrink-0 z-10 w-full mb-1">
          <div className="flex-1 bg-white rounded-full h-[46px] px-3 flex items-center gap-3 shadow-sm text-[#8696a0]">
            <Smile className="w-6 h-6" />
            <span className="text-[15px] flex-1 truncate">Mensagem</span>
            <Paperclip className="w-5 h-5" />
            <Camera className="w-5 h-5 ml-1" />
          </div>
          <div className="w-[46px] h-[46px] rounded-full bg-[#00a884] flex items-center justify-center text-white shadow-sm flex-shrink-0">
            <Mic className="w-[22px] h-[22px] fill-current" />
          </div>
        </div>
      </div>
    </div>
  );
}
