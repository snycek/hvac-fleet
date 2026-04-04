import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import { useApp } from '../context/AppContext.jsx';

const PUBLIC_PAGES = [
  'home', 'request-service', 'technician-apply', 'login',
  'furnace-repair', 'furnace-install', 'heating-maintenance',
  'ac-repair', 'ac-install', 'ductless-systems', 'ac-maintenance',
  'water-heater', 'indoor-air-quality', 'duct-cleaning', 'smart-thermostats',
  'specials', 'about', 'service-areas', 'testimonials', 'careers', 'contact',
];

export default function PageLayout({ page, setPage, children }) {
  const { role } = useApp();
  const isDashboard = role && !PUBLIC_PAGES.includes(page);

  if (isDashboard) {
    return (
      <div>
        <Navbar page={page} setPage={setPage} />
        <main>{children}</main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar page={page} setPage={setPage} />
      <main className="app-content">
        {children}
      </main>
    </div>
  );
}
