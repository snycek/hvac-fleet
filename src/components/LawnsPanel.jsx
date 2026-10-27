import { Fragment, memo, useState } from 'react';
import { allLawns, isPastDue, money, shortDate } from '../lib/lawns.js';
import { relativeDay, repeatLabel } from '../lib/dates.js';
import { formatSqFt } from '../lib/zones.js';

const th = { padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px', whiteSpace: 'nowrap' };

/** Every lawn at a glance: numbers only. Tap a row for its payment history. */
// bare: no title (the hub panel shows its own) and no outer card.
function LawnsPanel({ jobs, markPaid, today, bare = false }) {
  const [open, setOpen] = useState(null);
  const lawns = allLawns(jobs).sort((a, b) => (b.owed - a.owed) || (b.cuts - a.cuts));

  if (!lawns.length) return null;

  return (
    <section style={{ marginBottom: bare ? 0 : '28px' }}>
      {!bare && <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '14px' }}>🌱 Lawns</h2>}
      <div className={bare ? undefined : 'card'} style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              {['Lawn', 'Cuts', 'Avg', 'Paid', 'Owed', 'Last', 'Next'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {lawns.map(l => {
              const isOpen = open === l.key;
              return (
                <Fragment key={l.key}>
                  <tr onClick={() => setOpen(isOpen ? null : l.key)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isOpen ? 'var(--bg-elevated)' : 'transparent' }}>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: '150px' }}>
                      <div style={{ fontWeight: 600 }}>{isOpen ? '▾' : '▸'} {l.history.some(j => isPastDue(j, today)) && <span title="30+ days past due" aria-label="30+ days past due">⚠️ </span>}{l.name}{l.notes ? ' 📝' : ''}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{String(l.address).split(',')[0]}</div>
                    </td>
                    <td style={td}>{l.cuts}</td>
                    <td style={td}>{l.avgMinutes != null ? `${l.avgMinutes}m` : '—'}</td>
                    <td style={{ ...td, color: '#3fb950', fontWeight: 600 }}>{money(l.paid)}</td>
                    <td style={{ ...td, color: l.owed ? '#f0b429' : 'var(--text-muted)', fontWeight: 600 }}>{l.owed ? money(l.owed) : '—'}</td>
                    <td style={td}>{shortDate(l.lastCut)}</td>
                    <td style={td}>{l.nextCut ? relativeDay(l.nextCut, today) : '—'}</td>
                  </tr>
                  {isOpen && (
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                      <td colSpan={7} style={{ padding: '10px 14px 14px' }}>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                          <span>📞 {l.phone}</span>
                          {l.price != null && <span>💲{l.price}/cut</span>}
                          {l.repeatDays > 0 && <span>🔁 {repeatLabel(l.repeatDays)}</span>}
                          {l.sqFt && <span>📐 {formatSqFt(l.sqFt)}</span>}
                        </div>
                        {l.notes && <div style={{ fontSize: '13px', marginBottom: '10px' }}>📝 {l.notes}</div>}
                        {l.history.length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr', gap: '4px 16px', fontSize: '12px', alignItems: 'center', maxWidth: '420px' }}>
                            {l.history.map(j => {
                              const mins = j.startedAt && j.completedAt ? Math.round((new Date(j.completedAt) - new Date(j.startedAt)) / 60000) : null;
                              return (
                                <Fragment key={j.id}>
                                  <span>✂️ {shortDate(j.completedAt)}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>{mins != null ? `${mins}m` : '—'}</span>
                                  <span style={{ fontWeight: 600 }}>{money(j.earnings || 0)}</span>
                                  {j.paid ? (
                                    <span style={{ color: '#3fb950' }}>✓ {shortDate(j.paidAt)}</span>
                                  ) : (
                                    <span>
                                      <button type="button" className="btn-ghost" onClick={(e) => { e.stopPropagation(); markPaid(j.id, true); }} style={{ padding: '2px 10px', fontSize: '12px', color: '#f0b429' }}>
                                        Owed · Mark Paid
                                      </button>
                                    </span>
                                  )}
                                </Fragment>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No cuts yet</div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default memo(LawnsPanel);
