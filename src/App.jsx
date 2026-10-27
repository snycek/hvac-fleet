import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.jsx';
import PageLayout from './components/PageLayout.jsx';
import Home from './pages/Home.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import ServicePage from './pages/ServicePage.jsx';
import About from './pages/About.jsx';
import Specials from './pages/Specials.jsx';
import Testimonials from './pages/Testimonials.jsx';
import Contact from './pages/Contact.jsx';
import TechnicianView from './pages/TechnicianView.jsx';
import ManagerView from './pages/ManagerView.jsx';
import OwnerView from './pages/OwnerView.jsx';
import QuoteTool from './pages/QuoteTool.jsx';
import CustomerPortal from './pages/CustomerPortal.jsx';
import { SERVICE_PAGE_IDS } from './data/services.js';

function AppInner() {
  const [page, setPage] = useState('home');
  const { role } = useApp();

  // Scanned the QR on a paper invoice: straight to their account, no site chrome.
  if (window.location.pathname.startsWith('/pay')) return <CustomerPortal />;

  const renderPage = () => {
    // Dashboard views (keep existing behavior)
    if (page === 'technician') return role === 'technician' ? <TechnicianView /> : <Login setPage={setPage} />;
    if (page === 'manager') return role === 'manager' ? <ManagerView /> : <Login setPage={setPage} />;
    if (page === 'owner') return role === 'owner' ? <OwnerView /> : <Login setPage={setPage} />;

    // Auth
    if (page === 'login') return <Login setPage={setPage} />;

    // Request a Quote (the one way customers ask for service).
    // 'quote:<service-id>' preselects that service.
    if (page === 'quote' || page === 'request-service' || page.startsWith('quote:')) {
      return <QuoteTool key={page} setPage={setPage} initialServiceId={page.split(':')[1]} />;
    }

    // Service pages
    if (SERVICE_PAGE_IDS.includes(page)) return <ServicePage serviceId={page} setPage={setPage} />;

    // Technician applications
    if (page === 'technician-apply') return <Landing setPage={setPage} mode="apply" />;

    // Named pages
    if (page === 'about') return <About setPage={setPage} mode="story" />;
    if (page === 'service-areas') return <About setPage={setPage} mode="service-areas" />;
    if (page === 'specials') return <Specials setPage={setPage} />;
    if (page === 'testimonials') return <Testimonials />;
    if (page === 'contact') return <Contact setPage={setPage} />;

    // Default: Home
    return <Home setPage={setPage} />;
  };

  return (
    <PageLayout page={page} setPage={setPage}>
      {renderPage()}
    </PageLayout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
