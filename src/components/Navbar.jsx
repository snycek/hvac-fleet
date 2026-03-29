import { useApp } from '../context/AppContext.jsx';
import { useTechnicians } from '../hooks/useTechnicians.js';

export default function Navbar({ page, setPage }) {
  const { role, user, setUser, activeTechId, setActiveTechId, demoMode, logout } = useApp();
  const { technicians } = useTechnicians();
  const demoTechs = technicians.filter(t => t.status !== 'pending_approval');

  const handleLogout = () => {
    logout();
    setPage('landing');
  };

  const handleSwitchTech = (techId) => {
    const selected = demoTechs.find(t => t.id === techId);
    setActiveTechId(techId);
    if (selected) {
      setUser(prev => prev ? { ...prev, displayName: selected.name } : prev);
    }
  };

  const roleColors = { technician: '#0fd3c3', manager: '#1f6feb', owner: '#9c55f7' };
  const roleColor = roleColors[role] || '#8b949e';

  return (
    <nav style={{
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      height: '56px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '22px' }}>🦆</span>
        <span style={{ fontWeight: 700, fontSize: '18px', color: 'var(--accent-teal)' }}>DuctTales</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {user && (
          <span style={{
            background: roleColor + '22',
            color: roleColor,
            border: `1px solid ${roleColor}44`,
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'capitalize',
          }}>
            {role}
          </span>
        )}
        {user && (
          role === 'technician' && demoMode ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span>Tech:</span>
              <select
                value={activeTechId || ''}
                onChange={e => handleSwitchTech(e.target.value)}
                style={{
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  fontSize: '12px',
                  minWidth: '170px',
                }}
              >
                {(demoTechs.length ? demoTechs : [{ id: 'tech-001', name: 'Marcus Williams' }]).map(tech => (
                  <option key={tech.id} value={tech.id}>{tech.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {user.displayName}
            </span>
          )
        )}
        {page !== 'landing' && (
          <button className="btn-ghost" onClick={handleLogout} style={{ fontSize: '13px' }}>
            Logout
          </button>
        )}
      </div>
    </nav>
  );
}
