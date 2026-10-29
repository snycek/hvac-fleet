import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * First-time walkthrough: a speech bubble pointing at one part of the screen at a time.
 * steps: [{ targets: [css selectors, first visible wins], title, text }]
 * A step whose target isn't on screen is skipped.
 */
const PAD = 6;     // highlight padding around the target
const GAP = 12;    // space between target and bubble
const MARGIN = 12; // keep the bubble this far from the screen edges

const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const findTarget = step => step.targets.map(s => document.querySelector(s)).find(visible) || null;

export default function DemoTour({ steps, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i];

  // Bring the target into view, then follow it (resize, scroll, the demo moving things).
  useLayoutEffect(() => {
    const el = findTarget(step);
    if (!el) return undefined; // the step gets skipped below
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    let raf = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect(prev => (prev && Math.abs(prev.top - r.top) < 1 && Math.abs(prev.left - r.left) < 1 && Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1 ? prev : { top: r.top, left: r.left, width: r.width, height: r.height }));
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [step]);

  // Skip steps whose target isn't on this screen (e.g. desktop-only panels on a phone).
  useEffect(() => {
    if (!findTarget(step)) {
      const t = setTimeout(() => (i < steps.length - 1 ? setI(i + 1) : onClose()), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [i, step, steps.length, onClose]);

  const last = i === steps.length - 1;
  const next = () => (last ? onClose() : setI(i + 1));

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') { if (last) onClose(); else setI(n => n + 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onClose]);
  if (!rect) return null;

  // Bubble below the target if it fits, otherwise above; kept on screen.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(320, vw - MARGIN * 2);
  const estH = 170;
  const below = rect.top + rect.height + GAP + estH < vh || rect.top < estH + GAP;
  const top = below ? rect.top + rect.height + PAD + GAP : Math.max(MARGIN, rect.top - PAD - GAP - estH);
  const center = rect.left + rect.width / 2;
  const left = Math.min(Math.max(MARGIN, center - width / 2), vw - width - MARGIN);
  const arrowX = Math.min(Math.max(18, center - left), width - 18);

  return createPortal(
    <div className="tour-root" role="dialog" aria-label={step.title}>
      {/* Dim everything except the highlighted part (clicks pass through to nothing). */}
      <div className="tour-hole" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      <div className={`tour-bubble ${below ? 'below' : 'above'}`} style={{ top, left, width }}>
        <span className="tour-arrow" style={{ left: arrowX }} />
        <div className="tour-step">{i + 1} of {steps.length}</div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-text">{step.text}</div>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={onClose}>{last ? 'Close' : 'Skip tour'}</button>
          {i > 0 && <button type="button" className="btn-ghost tour-back" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" className="btn-primary tour-next" onClick={next}>{last ? 'Got it 👍' : 'Next →'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
