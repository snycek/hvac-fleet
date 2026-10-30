import { useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import YardMap from './YardMap.jsx';
import { formatSqFt } from '../lib/zones.js';
import { relativeDay, repeatLabel } from '../lib/dates.js';
import { JOB_STATUS } from '../lib/constants.js';

export default function JobCard({ job, actions, expanded = false, onClick, stopNo }) {
  const status = JOB_STATUS[job.status] || { label: job.status, color: '#8b949e' };
  const earnings = typeof job.earnings === 'number' ? `$${job.earnings.toFixed(2)}` : '';
  const [showZones, setShowZones] = useState(false);
  const quote = job.quote;
  const quoteZones = quote?.zones?.map((z, i) => ({ ...z, id: `${job.id}-z${i}` })) || [];

  return (
    <div
      className="card"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', transition: 'border-color 0.2s' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
            {stopNo != null && <span className="stop-no" aria-label={`Stop ${stopNo}`}>{stopNo}</span>}
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
              {job.service}
            </span>
            <StatusBadge label={status.label} color={status.color} />
          </div>
          {job.status === 'skipped' && (
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-muted)' }}>⏭ Skipped{job.skipReason ? ` · ${job.skipReason}` : ''}</div>
          )}
          {job.scheduledDate && !['completed', 'skipped'].includes(job.status) && (
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: relativeDay(job.scheduledDate).startsWith('Overdue') ? '#ff7b72' : 'var(--accent-teal)' }}>
              📅 {relativeDay(job.scheduledDate)}{job.repeatDays > 0 ? ` · ${repeatLabel(job.repeatDays)}` : ''}
            </div>
          )}
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

      {quote?.zones?.some(z => z.skip) && (
        <div className="dont-cut">🚫 Don't cut: <b>{quote.zones.filter(z => z.skip).map(z => z.name).join(', ')}</b></div>
      )}
      {quote?.zones?.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ background: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 }}>
            📐 {formatSqFt(quote.totalSqFt)} · {quote.zones.length} zone{quote.zones.length === 1 ? '' : 's'}{quote.estimate && ['quote', 'pending'].includes(job.status) ? ` · est. $${quote.estimate}` : ''}
          </span>
          {quote.zones.map((z, i) => (
            <span key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: z.skip ? 'transparent' : z.color, border: `1px solid ${z.color}` }} />{z.skip ? '🚫 ' : ''}{z.name}: {formatSqFt(z.sqFt)}{z.skip ? " (don't cut)" : ''}
            </span>
          ))}
          <button type="button" className="btn-ghost" onClick={e => { e.stopPropagation(); setShowZones(s => !s); }} style={{ padding: '3px 10px', fontSize: '12px' }}>
            {showZones ? 'Hide Map' : '🗺️ View Zones'}
          </button>
        </div>
      )}
      {quote?.zones?.length > 0 && showZones && (
        <div style={{ marginTop: '10px' }} onClick={e => e.stopPropagation()}>
          <YardMap zones={quoteZones} readOnly height="280px" />
        </div>
      )}

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
