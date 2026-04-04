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

const SERVICE_PAGE_IDS = [
  'furnace-repair', 'furnace-install', 'heating-maintenance',
  'ac-repair', 'ac-install', 'ductless-systems', 'ac-maintenance',
  'water-heater', 'indoor-air-quality', 'duct-cleaning', 'smart-thermostats',
];

function AppInner() {
  const [page, setPage] = useState('home');
  const { role } = useApp();

  const renderPage = () => {
    // Dashboard views (keep existing behavior)
    if (page === 'technician') return role === 'technician' ? <TechnicianView /> : <Login setPage={setPage} />;
    if (page === 'manager') return role === 'manager' ? <ManagerView /> : <Login setPage={setPage} />;
    if (page === 'owner') return role === 'owner' ? <OwnerView /> : <Login setPage={setPage} />;

    // Auth
    if (page === 'login') return <Login setPage={setPage} />;

    // Service pages
    if (SERVICE_PAGE_IDS.includes(page)) return <ServicePage serviceId={page} setPage={setPage} />;

    // Landing modes (request-service and technician-apply keep existing forms)
    if (page === 'request-service') return <Landing setPage={setPage} mode="request" />;
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
