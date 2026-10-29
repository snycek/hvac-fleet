import { useEffect, useState } from 'react';

// Waiting card while the AI outlines the yard: a little mower crosses a grass strip,
// leaving fresh-cut stripes as the bar fills. Time-based (eases toward ~95% over the
// expected wait; the parent removes it when the outline arrives).
const LINES = [
  'Looking at your yard from above…',
  'Checking behind the garage…',
  'Measuring the boulevard…',
  'Steering around the flower beds…',
  'Finding the back fence…',
  'Skipping the driveway…',
  'Counting square feet…',
];

export default function MowProgress({ findingHouse = false, seconds = 20 }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setT((Date.now() - start) / 1000), 200);
    return () => clearInterval(id);
  }, []);
  // Ease toward 95%: quick at first, slower near the end (never looks stuck or done early).
  const pct = Math.min(95, 100 * (1 - Math.exp((-2.2 * t) / seconds)));
  const step = findingHouse && t < 6 ? '📍 Finding your house…' : '✂️ Tracing your lawn…';
  const line = LINES[Math.floor(t / 3) % LINES.length];

  return (
    <div className="mow-card" role="status" aria-live="polite">
      <div className="mow-step">{step}</div>
      <div className="mow-track" aria-label={`${Math.round(pct)}% done`}>
        <div className="mow-cut" style={{ width: `${pct}%` }} />
        <div className="mow-mower" style={{ left: `${pct}%` }} aria-hidden="true">🚜</div>
      </div>
      <div className="mow-line">{line}</div>
    </div>
  );
}
