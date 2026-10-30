import { useState } from 'react';
import { orderStops, routeDrive, shortestOrder } from '../lib/routeOrder.js';
import { fmtDrive } from '../lib/distance.js';

const street = a => String(a || '').split(',')[0];
const DONE = ['completed', 'skipped'];

/**
 * Owner sets the order a truck drives today's stops. Starts from the app's order (shortest
 * drive from the yard, or the order he saved before). ↑/↓ moves a stop; "Shortest drive"
 * goes back to the app's order. Saving numbers the lawns, and repeat visits keep the number.
 */
export default function StopOrderModal({ tech, stops, onSave, onClose }) {
  const [order, setOrder] = useState(() => orderStops(stops));
  const [state, setState] = useState({ saving: false, error: '' });
  const shortest = shortestOrder(stops);
  const isShortest = order.every((j, i) => j.id === shortest[i]?.id);
  const move = (i, d) => setOrder(o => {
    const n = [...o];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });

  const save = async e => {
    e.preventDefault();
    setState({ saving: true, error: '' });
    try {
      // The app's own order: nothing to pin (clears any old numbers, so new lawns slot in by distance).
      await onSave(isShortest ? { clear: stops.map(j => j.id) } : { ids: order.map(j => j.id) });
      onClose();
    } catch (err) {
      setState({ saving: false, error: err.message });
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <form className="card" onClick={e => e.stopPropagation()} onSubmit={save}
        style={{ maxWidth: '460px', width: '100%', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '19px', marginBottom: '4px' }}>🧭 {tech.truckName || tech.name}&apos;s stops today</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Starts at the yard · about {fmtDrive(routeDrive(order))} of driving
            {isShortest ? ' · shortest drive' : ` · shortest is ${fmtDrive(routeDrive(shortest))}`}
          </p>
        </div>

        <ol className="stop-order">
          {order.map((j, i) => (
            <li key={j.id} className={DONE.includes(j.status) ? 'done' : undefined}>
              <span className="stop-no">{i + 1}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="stop-order-addr">{street(j.address)}</div>
                <div className="stop-order-who">{j.clientName}{DONE.includes(j.status) ? ` · ${j.status === 'skipped' ? 'skipped' : 'cut'}` : ''}{j.location ? '' : ' · no map spot'}</div>
              </div>
              <button type="button" className="btn-ghost" aria-label={`Move ${street(j.address)} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="btn-ghost" aria-label={`Move ${street(j.address)} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
            </li>
          ))}
        </ol>

        {state.error && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{state.error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" disabled={isShortest} onClick={() => setOrder(shortest)}>↺ Shortest drive</button>
          <span style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={state.saving}>{state.saving ? 'Saving…' : 'Save order'}</button>
          </span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
          The foreman&apos;s phone shows this order. Weekly lawns keep their spot next week; a new lawn slots in where it adds the fewest miles.
        </p>
      </form>
    </div>
  );
}
