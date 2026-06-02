import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { ShieldAlert, Users, LogOut, ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AdminDashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await auth.signOut();
    window.location.href = '/';
  };

  const navItems = [
    { label: 'Painel Global', path: '/admin', icon: ShieldAlert },
    { label: 'Voltar ao App', path: '/overview', icon: ArrowLeft },
  ];

  return (
    <div className="flex h-screen bg-primary">
      {/* Sidebar Admin Especial */}
      <aside className="w-64 bg-primary text-primary flex flex-col hidden md:flex border-r border-subtle">
        <div className="p-6 border-b border-subtle">
          <h1 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
            SuperAdmin 
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-red-50 text-red-600 border border-red-200">GOD MODE</span>
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-accent-primary/10 text-accent-primary font-semibold" 
                    : "text-secondary hover:bg-secondary hover:text-primary"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-subtle">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md text-sm font-medium text-secondary hover:text-primary hover:bg-secondary transition-colors border-none cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-tertiary text-primary">
        <Outlet />
      </main>
    </div>
  );
}
