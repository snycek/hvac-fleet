import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Walkthrough: a speech bubble pointing at one part of the screen at a time.
 * steps: [{ targets: [css selectors, first visible wins], title, text,
 *           before?: () => void  — open what the step shows (switch tab, open a stub…)
 *           after?:  () => void  — runs when leaving the step forward (e.g. run payroll) }]
 * A step whose target never shows up (about 2 s) is skipped. onClose tidies up.
 */
const PAD = 6;      // highlight padding around the target
const GAP = 12;     // space between target and bubble
const MARGIN = 12;  // keep the bubble this far from the screen edges
const WAIT_MS = 2000;

const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const findTarget = step => step.targets.map(s => document.querySelector(s)).find(visible) || null;

export default function DemoTour({ steps, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const bubbleRef = useRef(null);
  const [bubbleH, setBubbleH] = useState(190); // real height, measured after it draws
  const step = steps[i];
  // Latest steps/onClose without re-running a step's 'open this' action every render.
  const stepsRef = useRef(steps);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { stepsRef.current = steps; closeRef.current = onClose; });

  // Each step: open what it shows, wait for its target to appear, then follow it.
  useEffect(() => {
    const s = stepsRef.current[i];
    s.before?.();
    let raf = 0;
    let el = null;
    let scrolled = false;
    const started = performance.now();
    const tick = () => {
      if (!el || !el.isConnected) el = findTarget(s);
      if (!el) {
        if (performance.now() - started > WAIT_MS) { // not on this screen: skip it
          if (i < stepsRef.current.length - 1) setI(i + 1); else closeRef.current();
          return;
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      if (!scrolled) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); scrolled = true; }
      const r = el.getBoundingClientRect();
      setRect(prev => (prev && Math.abs(prev.top - r.top) < 1 && Math.abs(prev.left - r.left) < 1 && Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1 ? prev : { top: r.top, left: r.left, width: r.width, height: r.height }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i]);

  const last = i === steps.length - 1;
  const forward = () => { step.after?.(); setRect(null); if (last) onClose(); else setI(i + 1); };
  const back = () => { setRect(null); setI(i - 1); };

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') forward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Measure the bubble once it's drawn so long steps are placed (and kept on screen) correctly.
  const shown = Boolean(rect);
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setBubbleH(el.offsetHeight || 190));
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown, i]);

  if (!rect) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(330, vw - MARGIN * 2);
  const estH = bubbleH;
  // Highlight, clipped to the screen (a printed page is taller than the screen).
  const hole = {
    top: Math.max(4, rect.top - PAD), left: Math.max(4, rect.left - PAD),
    bottom: Math.min(vh - 4, rect.top + rect.height + PAD), right: Math.min(vw - 4, rect.left + rect.width + PAD),
  };
  const fitsBelow = hole.bottom + GAP + estH < vh;
  const fitsAbove = hole.top - GAP - estH > 0;
  // Big targets (a statement, a pay stub): the bubble sits in the lower corner over them.
  const pinned = !fitsBelow && !fitsAbove;
  const below = fitsBelow || (!fitsAbove && !pinned);
  const top = pinned ? vh - estH - MARGIN - 20 : below ? hole.bottom + GAP : hole.top - GAP - estH;
  const center = rect.left + rect.width / 2;
  const left = pinned ? vw - width - MARGIN : Math.min(Math.max(MARGIN, center - width / 2), vw - width - MARGIN);
  const arrowX = Math.min(Math.max(18, center - left), width - 18);

  return createPortal(
    <div className="tour-root" role="dialog" aria-label={step.title}>
      <div className="tour-hole" style={{ top: hole.top, left: hole.left, width: hole.right - hole.left, height: hole.bottom - hole.top }} />
      <div ref={bubbleRef} className={`tour-bubble ${pinned ? 'pinned' : below ? 'below' : 'above'}`} style={{ top: Math.max(MARGIN, Math.min(top, vh - estH - MARGIN)), left, width }}>
        {!pinned && <span className="tour-arrow" style={{ left: arrowX }} />}
        <div className="tour-step">{i + 1} of {steps.length}</div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-text">{step.text}</div>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={onClose}>{last ? 'Close' : 'Skip tour'}</button>
          {i > 0 && <button type="button" className="btn-ghost tour-back" onClick={back}>Back</button>}
          <button type="button" className="btn-primary tour-next" onClick={forward}>{last ? 'Got it 👍' : step.nextLabel || 'Next →'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
