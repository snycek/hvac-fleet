import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import { useApp } from '../context/AppContext.jsx';
import { SERVICE_PAGE_IDS } from '../data/services.js';

const PUBLIC_PAGES = [
  'home', 'request-service', 'technician-apply', 'login', 'quote',
  ...SERVICE_PAGE_IDS,
  'specials', 'about', 'service-areas', 'testimonials', 'careers', 'contact',
];

export default function PageLayout({ page, setPage, children }) {
  const { role } = useApp();
  const isDashboard = role && !PUBLIC_PAGES.includes(page) && !page.startsWith('quote');

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
