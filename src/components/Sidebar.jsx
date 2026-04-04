import { useState } from 'react';
import './Sidebar.css';

const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  {
    id: 'heating', label: 'Heating', children: [
      { id: 'furnace-repair', label: 'Furnace Repair' },
      { id: 'furnace-install', label: 'Furnace Install' },
      { id: 'heating-maintenance', label: 'Heating Maintenance' },
    ],
  },
  {
    id: 'cooling', label: 'Cooling', children: [
      { id: 'ac-repair', label: 'AC Repair' },
      { id: 'ac-install', label: 'AC Install' },
      { id: 'ductless-systems', label: 'Ductless Systems' },
      { id: 'ac-maintenance', label: 'AC Maintenance' },
    ],
  },
  {
    id: 'home-services', label: 'Home Services', children: [
      { id: 'water-heater', label: 'Water Heater' },
      { id: 'indoor-air-quality', label: 'Indoor Air Quality' },
      { id: 'duct-cleaning', label: 'Duct Cleaning' },
      { id: 'smart-thermostats', label: 'Smart Thermostats' },
    ],
  },
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
          <span>&#129414;</span>
          <span>DuctTales</span>
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
          <a href="tel:3133789982" className="sidebar-emergency">
            &#128248; Emergency: (313) 378-9982
          </a>
          <button className="sidebar-portal" onClick={() => { setPage('login'); setMobileOpen(false); }}>
            Portal Login &rarr;
          </button>
        </div>
      </aside>
    </>
  );
}
