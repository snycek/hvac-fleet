import { useApp } from '../context/AppContext.jsx';
import { useTechnicians } from '../hooks/useTechnicians.js';
import { useState } from 'react';

const DEMO_ROLES = [
  {
    role: 'technician',
    techId: 'tech-001',
    icon: '🔧',
    title: 'Technician',
    desc: 'View assigned jobs, update status, mark jobs complete',
    color: '#0fd3c3',
  },
  {
    role: 'manager',
    icon: '📋',
    title: 'Manager',
    desc: 'Assign incoming jobs to available technicians',
    color: '#1f6feb',
  },
  {
    role: 'owner',
    icon: '📊',
    title: 'Owner',
    desc: 'Live fleet map, technician status, earnings reports',
    color: '#9c55f7',
  },
];

export default function Login({ setPage }) {
  const { loginDemo } = useApp();
  const { technicians } = useTechnicians();
  const selectableTechs = technicians.filter(t => t.status !== 'pending_approval');
  const [selectedTechId, setSelectedTechId] = useState('tech-001');

  const handleDemo = (role, techId) => {
    const resolvedTechId = role === 'technician' ? (techId || selectedTechId) : null;
    const selectedTech = role === 'technician' ? selectableTechs.find(t => t.id === resolvedTechId) : null;
    loginDemo(role, resolvedTechId, selectedTech?.name || null);
    setPage(role);
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
    }}>
      <div style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🦆</div>
        <h1 style={{ fontSize: '30px', fontWeight: 700, marginBottom: '10px' }}>DuctTales Portal</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '40px', fontSize: '15px' }}>
          Select your role to enter the demo — no account required.
        </p>

        <div className="card" style={{ marginBottom: '16px', padding: '14px 16px', textAlign: 'left' }}>
          <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Technician Login Profile</label>
          <select className="form-input" value={selectedTechId} onChange={e => setSelectedTechId(e.target.value)}>
            {(selectableTechs.length ? selectableTechs : [{ id: 'tech-001', name: 'Marcus Williams' }]).map(tech => (
              <option key={tech.id} value={tech.id}>{tech.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {DEMO_ROLES.map(({ role, techId, icon, title, desc, color }) => (
            <button
              key={role}
              onClick={() => handleDemo(role, role === 'technician' ? selectedTechId : techId)}
              style={{
                background: 'var(--bg-elevated)',
                border: `2px solid ${color}44`,
                borderRadius: '12px',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.2s, background 0.2s',
                width: '100%',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = color + '11'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = color + '44'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
            >
              <div style={{
                width: '52px', height: '52px', borderRadius: '50%',
                background: color + '22', border: `2px solid ${color}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '24px', flexShrink: 0,
              }}>
                {icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '17px', color: color, marginBottom: '4px' }}>
                  Demo as {title}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {desc}
                </div>
              </div>
              <div style={{ color: color, fontSize: '20px', flexShrink: 0 }}>→</div>
            </button>
          ))}
        </div>

        <p style={{ marginTop: '32px', fontSize: '13px', color: 'var(--text-muted)' }}>
          <button className="btn-ghost" onClick={() => setPage('landing')} style={{ fontSize: '13px' }}>
            ← Back to Home
          </button>
        </p>
      </div>
    </div>
  );
}
