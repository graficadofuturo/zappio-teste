import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { LayoutDashboard, Smartphone, Megaphone, Link as LinkIcon, CreditCard, LogOut, ShoppingCart } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function ClientDashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  const navItems = [
    { label: 'Visão Geral', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Meu WhatsApp', path: '/dashboard/instances', icon: Smartphone },
    { label: 'Campanhas', path: '/dashboard/campaigns', icon: Megaphone },
    { label: 'Integrações', path: '/dashboard/integrations', icon: LinkIcon },
    { label: 'Produtos ML', path: '/dashboard/products', icon: ShoppingCart },
    { label: 'Minha Assinatura', path: '/pricing', icon: CreditCard },
  ];

  return (
    <div className="flex h-screen bg-tertiary">
      {/* Sidebar */}
      <aside className="w-[260px] bg-primary border-r border-subtle flex flex-col hidden md:flex p-6">
        <div className="flex items-center gap-2 mb-12">
          <div className="w-8 h-8 bg-accent rounded-md flex-shrink-0"></div>
          <h1 className="text-[18px] font-extrabold tracking-[-0.02em] text-primary">ZapBot AI</h1>
        </div>
        
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-[14px] font-medium transition-colors",
                  isActive 
                    ? "bg-secondary text-primary font-semibold" 
                    : "text-secondary hover:text-primary"
                )}
              >
                <item.icon className="h-4 w-4 opacity-50" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="pt-5 border-t border-subtle mt-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-secondary border border-subtle flex-shrink-0"></div>
            <div className="overflow-hidden flex-1">
              <p className="text-[12px] font-semibold text-primary truncate">Usuário logado</p>
              <p className="text-[10px] text-secondary truncate">Configuração ativa</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md text-[14px] font-medium text-secondary hover:text-primary hover:bg-secondary/50 transition-colors"
          >
            <LogOut className="h-4 w-4 opacity-50" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-secondary">
        <Outlet />
      </main>
    </div>
  );
}
