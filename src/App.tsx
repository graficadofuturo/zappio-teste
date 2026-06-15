import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ClientDashboardLayout from './components/layout/ClientDashboardLayout.js';
import AdminDashboardLayout from './components/layout/AdminDashboardLayout.js';
import Overview from './pages/Overview.js';
import WhatsAppInstances from './pages/Instances.js';
import Campaigns from './pages/Campaigns.js';
import Integrations from './pages/Integrations.js';
import Products from './pages/Products.js';
import Subscription from './pages/Subscription.js';
import AdminOverview from './pages/admin/AdminOverview.js';
import { useState, useEffect } from 'react';


function App() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Background ping to execute campaign scheduler ticks while dashboard is open
    const interval = setInterval(() => {
      fetch('/api/campaigns/trigger-tick', { method: 'POST' }).catch(err => {
        console.error("[App] Failed to background trigger campaign tick:", err);
      });
    }, 45000); // 45 seconds
    
    // First trigger immediately on mount
    fetch('/api/campaigns/trigger-tick', { method: 'POST' }).catch(() => {});

    return () => clearInterval(interval);
  }, []);

  return (
    <Router>
      <Routes>
        {/* Root redirects straight to Overview (Dashboard) */}
        <Route path="/" element={<Navigate to="/overview" replace />} />
        
        {/* Bypass login/register paths and redirect straight to Overview */}
        <Route path="/auth/login" element={<Navigate to="/overview" replace />} />
        <Route path="/auth/register" element={<Navigate to="/overview" replace />} />
        <Route path="/pricing" element={<Navigate to="/overview" replace />} />

        {/* Dashboard Routes */}
        <Route element={<ClientDashboardLayout />}>
          <Route path="/overview" element={<Overview />} />
          <Route path="/instances" element={<WhatsAppInstances />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/products" element={<Products />} />
          <Route path="/subscription" element={<Subscription />} />
          {/* Fallback to overview if user was at old dashboard route */}
          <Route path="/dashboard/*" element={<Navigate to="/overview" replace />} />
        </Route>
        
        {/* Admin Routes */}
        <Route path="/admin" element={isAdmin ? <AdminDashboardLayout /> : <Navigate to="/overview" />}>
          <Route index element={<AdminOverview />} />
        </Route>

        {/* Fallback for all other routes */}
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
