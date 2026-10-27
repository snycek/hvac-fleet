import { PERIODS, effectiveAnchor, isCurrentOrLater, periodHas, periodLabel, shiftPeriod } from '../lib/lawns.js';
import { todayString } from '../lib/dates.js';

/**
 * Day | Week | Month toggle with ‹ label › stepping.
 * value: { mode, anchor, pinned }. Unpinned periods follow `today` (so the demo's
 * calendar carries the view forward); stepping back pins it until you return.
 */
export default function PeriodPicker({ value, onChange, today = todayString(), compact = false }) {
  const { mode } = value;
  const anchor = effectiveAnchor(value, today);
  const atEnd = isCurrentOrLater(mode, anchor, today);
  const step = delta => {
    const next = shiftPeriod(mode, anchor, delta);
    onChange({ mode, anchor: next, pinned: !periodHas(mode, next, today) });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '4px' : '8px', flexWrap: 'wrap' }}>
      <div role="group" aria-label="Period" style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        {PERIODS.map(p => (
          <button key={p.id} type="button" aria-pressed={mode === p.id}
            // Switching period jumps back to the one containing today.
            onClick={() => onChange({ mode: p.id, anchor: today, pinned: false })}
            style={{
              padding: compact ? '3px 7px' : '6px 12px', fontSize: compact ? '11.5px' : '13px', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: mode === p.id ? 'var(--accent-teal)22' : 'transparent',
              color: mode === p.id ? 'var(--accent-teal)' : 'var(--text-muted)',
            }}>{p.label}</button>
        ))}
      </div>
      <button type="button" className="btn-ghost" onClick={() => step(-1)} aria-label={`Previous ${mode}`} style={{ padding: compact ? '2px 7px' : '6px 12px' }}>‹</button>
      <span style={{ fontWeight: 700, minWidth: compact ? 0 : '150px', textAlign: 'center', fontSize: compact ? '12px' : '14px', whiteSpace: 'nowrap' }}>{compact ? periodLabel(mode, anchor, today).replace(/^(Today|This week) · /, '') : periodLabel(mode, anchor, today)}</span>
      <button type="button" className="btn-ghost" onClick={() => step(1)} disabled={atEnd} aria-label={`Next ${mode}`} style={{ padding: compact ? '2px 7px' : '6px 12px', opacity: atEnd ? 0.4 : 1 }}>›</button>
    </div>
  );
}
