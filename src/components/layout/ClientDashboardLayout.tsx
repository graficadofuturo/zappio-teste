import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import {
  LayoutDashboard, Smartphone, Megaphone, Link as LinkIcon,
  CreditCard, LogOut, ShoppingCart, Zap, Menu, Bell, X, ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState } from 'react';

const navItems = [
  { label: 'Visão Geral', path: '/overview', icon: LayoutDashboard },
  { label: 'Meu WhatsApp', path: '/instances', icon: Smartphone },
  { label: 'Campanhas', path: '/campaigns', icon: Megaphone },
  { label: 'Integrações', path: '/integrations', icon: LinkIcon },
  { label: 'Banco de Ofertas', path: '/products', icon: ShoppingCart },
  { label: 'Assinatura', path: '/subscription', icon: CreditCard },
];

const pageLabels: Record<string, string> = {
  overview: 'Visão Geral',
  instances: 'Meu WhatsApp',
  campaigns: 'Campanhas',
  integrations: 'Integrações',
  products: 'Banco de Ofertas',
  subscription: 'Assinatura',
};

export default function ClientDashboardLayout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await auth.signOut();
    window.location.href = '/';
  };

  const currentPage = location.pathname.split('/').pop() || 'overview';
  const pageLabel = pageLabels[currentPage] || currentPage;

  const userEmail = auth.currentUser?.email || '';
  const isAnonymous = auth.currentUser?.isAnonymous;
  const userName = isAnonymous ? 'Convidado' : (userEmail.split('@')[0] || 'Usuário');
  const userInitial = isAnonymous ? 'C' : (userEmail.charAt(0).toUpperCase() || 'U');

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="flex items-center gap-3">
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #25D366, #1a9d4d)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)',
            flexShrink: 0
          }}>
            <Zap size={18} color="#022c1a" strokeWidth={2.5} />
          </div>
          <div className="logo-text">
            <h1 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontSize: 18, fontWeight: 800,
              background: 'linear-gradient(135deg, #25D366, #7cf4b5)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.3px', lineHeight: 1.2
            }}>Zappio</h1>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Automação WhatsApp
            </p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div style={{ padding: '12px 12px 4px' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12, padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #25D366 0%, #1ea355 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#022c1a', flexShrink: 0
          }}>
            {userInitial}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }} className="logo-text">
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userName}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Free Trial</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', padding: '8px 12px 6px', marginBottom: 4 }}>
          Menu
        </p>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/overview' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNav}
              className={cn('sidebar-nav-item nav-icon', isActive && 'active')}
            >
              <item.icon size={17} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>{item.label}</span>
              {isActive && <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer" style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
          <Zap size={14} color="var(--green)" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.3px', textTransform: 'uppercase' }}>Modo Sem Cadastro</span>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* Desktop Sidebar */}
      <aside className="sidebar" style={{ display: 'flex' }}>
        <SidebarContent />
      </aside>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)', zIndex: 99, display: 'flex'
          }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            style={{
              width: 'var(--sidebar-width)', background: 'var(--bg-surface)',
              borderRight: '1px solid var(--border-subtle)',
              height: '100vh', display: 'flex', flexDirection: 'column',
              boxShadow: '4px 0 32px rgba(0,0,0,0.6)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <SidebarContent onNav={() => setMobileMenuOpen(false)} />
          </aside>
          <button
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'var(--bg-card)', border: '1px solid var(--border-medium)',
              borderRadius: 8, padding: 8, color: 'var(--text-primary)', cursor: 'pointer'
            }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Top Header */}
        <header style={{
          height: 60, background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', position: 'sticky', top: 0, zIndex: 40,
          backdropFilter: 'blur(12px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setMobileMenuOpen(true)}
              style={{ display: 'none' }}
              id="mobile-menu-btn"
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontSize: 16, fontWeight: 700, color: 'var(--text-primary)'
              }}>
                {pageLabel}
              </h2>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Notification Bell */}
            <button className="btn btn-ghost btn-icon" style={{ position: 'relative' }}>
              <Bell size={18} />
              <span style={{
                position: 'absolute', top: 6, right: 6,
                width: 7, height: 7, borderRadius: '50%',
                background: '#25D366',
                border: '2px solid var(--bg-surface)'
              }} />
            </button>

            {/* Avatar */}
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg, #25D366, #1ea355)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#022c1a',
              cursor: 'pointer', marginLeft: 4,
              border: '2px solid var(--border-medium)'
            }}>
              {userInitial}
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </div>
      </main>

      <style>{`
        @media (max-width: 1024px) {
          .sidebar { width: var(--sidebar-collapsed) !important; }
          .sidebar .logo-text { display: none; }
          .sidebar .sidebar-nav-item span { display: none; }
          .main-content { margin-left: var(--sidebar-collapsed) !important; }
        }
        @media (max-width: 768px) {
          .sidebar { display: none !important; }
          .main-content { margin-left: 0 !important; }
          #mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
