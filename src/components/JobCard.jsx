import StatusBadge from './StatusBadge.jsx';
import { JOB_STATUS } from '../lib/constants.js';

export default function JobCard({ job, actions, expanded = false, onClick }) {
  const status = JOB_STATUS[job.status] || { label: job.status, color: '#8b949e' };
  const earnings = typeof job.earnings === 'number' ? `$${job.earnings.toFixed(2)}` : '';

  return (
    <div
      className="card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', transition: 'border-color 0.2s' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
              {job.service}
            </span>
            <StatusBadge label={status.label} color={status.color} />
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '2px' }}>
            👤 {job.clientName} &nbsp;·&nbsp; 📞 {job.clientPhone}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            📍 {job.address}
            {job.address && (
              <a
                href={`https://waze.com/ul?q=${encodeURIComponent(job.address)}&navigate=yes`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: '#00aeef22', color: '#00aeef',
                  border: '1px solid #00aeef44', borderRadius: '12px',
                  padding: '2px 10px', fontSize: '11px', fontWeight: 600,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                  transition: 'background 0.15s',
                }}
              >
                <img src="https://www.waze.com/favicon.ico" alt="" width="12" height="12" style={{ borderRadius: '2px' }} />
                Open in Waze
              </a>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {earnings && (
            <div style={{ fontWeight: 700, color: '#3fb950', fontSize: '16px' }}>{earnings}</div>
          )}
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
            {new Date(job.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      {expanded && job.notes && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: 'var(--bg-primary)',
          borderRadius: '6px',
          fontSize: '13px',
          color: 'var(--text-muted)',
          borderLeft: '3px solid var(--accent-blue)',
        }}>
          📝 {job.notes}
        </div>
      )}

      {actions && (
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
