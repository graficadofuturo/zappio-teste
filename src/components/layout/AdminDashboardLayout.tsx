import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { ShieldAlert, Users, LogOut, ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function AdminDashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  const navItems = [
    { label: 'Painel Global', path: '/admin', icon: ShieldAlert },
    { label: 'Voltar ao App', path: '/dashboard', icon: ArrowLeft },
  ];

  return (
    <div className="flex h-screen bg-primary">
      {/* Sidebar Admin Especial */}
      <aside className="w-64 bg-[#0B0B0B] text-white flex flex-col hidden md:flex border-r border-[#1a1a1a]">
        <div className="p-6 border-b border-[#2a2a2a]">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            SuperAdmin 
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-red-500/20 text-red-500 border border-red-500/30">GOD MODE</span>
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
                    ? "bg-white/10 text-white font-semibold" 
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-[#2a2a2a]">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md text-sm font-medium text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#050505] text-[#e0e0e0]">
        <Outlet />
      </main>
    </div>
  );
}
