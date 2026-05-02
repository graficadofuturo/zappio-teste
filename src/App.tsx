import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import LandingPage from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Pricing from './pages/Pricing';
import ClientDashboardLayout from './components/layout/ClientDashboardLayout';
import AdminDashboardLayout from './components/layout/AdminDashboardLayout';
import DashboardOverview from './pages/dashboard/Overview';
import WhatsAppInstances from './pages/dashboard/Instances';
import Campaigns from './pages/dashboard/Campaigns';
import Integrations from './pages/dashboard/Integrations';
import Products from './pages/dashboard/Products';
import AdminOverview from './pages/admin/AdminOverview';
import { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestore-utils';



function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await checkAdminStatus(currentUser.uid);
      } else {
        setIsAdmin(false);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const checkAdminStatus = async (userId: string) => {
    try {
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (userSnap.exists() && userSnap.data()?.is_admin) {
        setIsAdmin(true);
      }
    } catch (e: any) {
      if (e.message?.includes('Missing or insufficient permissions')) {
        handleFirestoreError(e, OperationType.GET, 'users');
      } else {
        console.error(e);
      }
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-primary text-primary">Carregando...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/auth/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/auth/register" element={!user ? <Register /> : <Navigate to="/dashboard" />} />

        {/* Rotas Protegidas - App */}
        <Route path="/dashboard" element={user ? <ClientDashboardLayout /> : <Navigate to="/auth/login" />}>
          <Route index element={<DashboardOverview />} />
          <Route path="instances" element={<WhatsAppInstances />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="products" element={<Products />} />
        </Route>

        {/* Rotas Admin */}
        <Route path="/admin" element={user && isAdmin ? <AdminDashboardLayout /> : <Navigate to="/dashboard" />}>
          <Route index element={<AdminOverview />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
