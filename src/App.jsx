import { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.jsx';
import Navbar from './components/Navbar.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import TechnicianView from './pages/TechnicianView.jsx';
import ManagerView from './pages/ManagerView.jsx';
import OwnerView from './pages/OwnerView.jsx';

function AppInner() {
  const [page, setPage] = useState('landing');
  const { role } = useApp();

  const renderPage = () => {
    switch (page) {
      case 'landing':    return <Landing setPage={setPage} mode="home" />;
      case 'request-service': return <Landing setPage={setPage} mode="request" />;
      case 'technician-apply': return <Landing setPage={setPage} mode="apply" />;
      case 'login':      return <Login setPage={setPage} />;
      case 'technician': return role === 'technician' ? <TechnicianView /> : <Login setPage={setPage} />;
      case 'manager':    return role === 'manager'    ? <ManagerView />    : <Login setPage={setPage} />;
      case 'owner':      return role === 'owner'      ? <OwnerView />      : <Login setPage={setPage} />;
      default:           return <Landing setPage={setPage} mode="home" />;
    }
  };

  return (
    <div>
      <Navbar page={page} setPage={setPage} />
      <main>{renderPage()}</main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
