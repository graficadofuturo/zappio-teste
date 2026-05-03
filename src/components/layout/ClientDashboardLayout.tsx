import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { LayoutDashboard, Smartphone, Megaphone, Link as LinkIcon, CreditCard, LogOut, ShoppingCart, Zap, Menu, Bell, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState } from 'react';

export default function ClientDashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  const navItems = [
    { label: 'Visão Geral', path: '/overview', icon: LayoutDashboard },
    { label: 'Meu WhatsApp', path: '/instances', icon: Smartphone },
    { label: 'Campanhas', path: '/campaigns', icon: Megaphone },
    { label: 'Integrações', path: '/integrations', icon: LinkIcon },
    { label: 'Banco de Ofertas', path: '/products', icon: ShoppingCart },
    { label: 'Assinatura', path: '/subscription', icon: CreditCard },
  ];

  return (
    <div className="flex h-screen bg-[#fafafa] font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Sidebar Desktop */}
      <aside className="w-[280px] bg-white border-r border-gray-200 hidden md:flex flex-col relative z-20">
        <div className="flex items-center gap-2 px-6 h-16 border-b border-gray-100 mb-4">
          <div className="w-7 h-7 bg-indigo-600 rounded flex items-center justify-center flex-shrink-0 shadow-sm">
             <Zap className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-[16px] font-extrabold tracking-tight text-gray-900">Zappio</h1>
        </div>
        
        <div className="px-4 mb-4">
           <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-white shadow-sm flex items-center justify-center text-indigo-600 font-bold text-[14px]">Z</div>
              <div className="flex-1 overflow-hidden">
                 <p className="text-[13px] font-bold text-gray-900 truncate">{auth.currentUser?.email?.split('@')[0] || 'Minha Conta'}</p>
                 <p className="text-[11px] text-gray-500 font-medium">Plano Free</p>
              </div>
           </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4 px-2">Menu Principal</div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/overview' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all group",
                  isActive 
                    ? "bg-indigo-50 text-indigo-700" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600")} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-lg text-[13px] font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4 text-gray-400" />
            Sair da conta
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10 w-full">
           <div className="flex items-center gap-4">
              <button className="md:hidden text-gray-500 hover:text-gray-900" onClick={() => setMobileMenuOpen(true)}>
                 <Menu className="w-5 h-5" />
              </button>
              <h2 className="text-[14px] font-bold text-gray-900 capitalize hidden sm:block">
                 {location.pathname.split('/').pop() === 'overview' ? 'Visão Geral' : location.pathname.split('/').pop()?.replace('-', ' ')}
              </h2>
           </div>
           
           <div className="flex items-center gap-4">
              <button className="text-gray-400 hover:text-gray-600 transition-colors">
                 <HelpCircle className="w-5 h-5" />
              </button>
              <button className="text-gray-400 hover:text-gray-600 transition-colors relative">
                 <Bell className="w-5 h-5" />
                 <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
              </button>
              <div className="w-8 h-8 rounded-full border border-gray-200 overflow-hidden bg-gray-50 ml-2 shadow-sm">
                 <img src={auth.currentUser?.photoURL || `https://ui-avatars.com/api/?name=${auth.currentUser?.email}&background=e2e8f0&color=475569`} alt="Avatar" className="w-full h-full object-cover" />
              </div>
           </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
         <div 
            className="fixed inset-0 bg-gray-900/50 z-40 md:hidden animate-in fade-in duration-200" 
            onClick={() => setMobileMenuOpen(false)}
         />
      )}

      {/* Mobile Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-[280px] bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 md:hidden flex flex-col",
        mobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      )}>
        <div className="flex items-center gap-2 px-6 h-16 border-b border-gray-100 mb-4">
          <div className="w-7 h-7 bg-indigo-600 rounded flex items-center justify-center flex-shrink-0 shadow-sm">
             <Zap className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-[16px] font-extrabold tracking-tight text-gray-900">Zappio</h1>
        </div>
        
        <div className="px-4 mb-4">
           <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-white shadow-sm flex items-center justify-center text-indigo-600 font-bold text-[14px]">Z</div>
              <div className="flex-1 overflow-hidden">
                 <p className="text-[13px] font-bold text-gray-900 truncate">{auth.currentUser?.email?.split('@')[0] || 'Minha Conta'}</p>
                 <p className="text-[11px] text-gray-500 font-medium">Plano Free</p>
              </div>
           </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4 px-2">Menu Principal</div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/overview' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all group",
                  isActive 
                    ? "bg-indigo-50 text-indigo-700" 
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600")} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-lg text-[13px] font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4 text-gray-400" />
            Sair da conta
          </button>
        </div>
      </aside>
    </div>
  );
}
