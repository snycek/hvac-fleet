import { useState } from 'react';
import './Sidebar.css';
import { ALL_SERVICES, COMPANY_INFO } from '../data/services.js';

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  {
    id: 'services', label: 'Services',
    children: ALL_SERVICES.map(s => ({ id: s.id, label: s.name })),
  },
  { id: 'quote', label: 'Request a Quote' },
  { id: 'specials', label: 'Specials' },
  {
    id: 'about-group', label: 'About', children: [
      { id: 'about', label: 'Our Story' },
      { id: 'service-areas', label: 'Service Areas' },
      { id: 'testimonials', label: 'Testimonials' },
    ],
  },
  { id: 'careers', label: 'Careers' },
  { id: 'contact', label: 'Contact' },
];

export default function Sidebar({ page, setPage }) {
  const [expanded, setExpanded] = useState({});
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const navigate = (id) => {
    if (id === 'careers') {
      setPage('technician-apply');
    } else {
      setPage(id);
    }
    setMobileOpen(false);
    window.scrollTo(0, 0);
  };

  const isActive = (id) => {
    if (id === 'home' && page === 'home') return true;
    if (id === 'careers' && page === 'technician-apply') return true;
    if (id === 'quote' && page.startsWith('quote')) return true;
    return page === id;
  };

  const isParentActive = (item) => {
    if (!item.children) return false;
    return item.children.some(c => isActive(c.id));
  };

  return (
    <>
      <button
        className="sidebar-hamburger"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        &#9776;
      </button>

      <div
        className={`sidebar-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        <button
          className="sidebar-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          &times;
        </button>

        <div className="sidebar-logo" onClick={() => navigate('home')}>
          <span>🌱</span>
          <span>{COMPANY_INFO.shortName}</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <div key={item.id}>
              {item.children ? (
                <>
                  <button
                    className={`sidebar-item${isParentActive(item) ? ' active' : ''}`}
                    onClick={() => toggleExpand(item.id)}
                  >
                    <span>{item.label}</span>
                    <span className={`sidebar-arrow${expanded[item.id] ? ' open' : ''}`}>&#9654;</span>
                  </button>
                  <div className={`sidebar-submenu${expanded[item.id] ? ' open' : ''}`}>
                    {item.children.map(child => (
                      <button
                        key={child.id}
                        className={`sidebar-subitem${isActive(child.id) ? ' active' : ''}`}
                        onClick={() => navigate(child.id)}
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <button
                  className={`sidebar-item${isActive(item.id) ? ' active' : ''}`}
                  onClick={() => navigate(item.id)}
                >
                  <span>{item.label}</span>
                </button>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <a href={COMPANY_INFO.phoneHref} className="sidebar-emergency">
            📞 Call: {COMPANY_INFO.phone}
          </a>
          <button className="sidebar-portal" onClick={() => { setPage('login'); setMobileOpen(false); }}>
            Portal Login &rarr;
          </button>
        </div>
      </aside>
    </>
  );
}
