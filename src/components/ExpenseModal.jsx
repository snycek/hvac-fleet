import { useState } from 'react';
import { MANUAL_EXPENSE_TYPES } from '../lib/lawns.js';
import { todayString } from '../lib/dates.js';
import { compressImage } from '../hooks/useExpenses.js';

/**
 * Add an expense. Foremen must attach a receipt photo; the owner's own entries
 * can skip it and go straight into the books.
 */
export default function ExpenseModal({ title = 'Add Expense', requireReceipt = false, submitLabel = 'Send', onSubmit, onClose }) {
  const [category, setCategory] = useState('gas');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayString());
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [state, setState] = useState({ busy: false, error: '' });

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setState({ busy: true, error: '' });
    try {
      setReceipt(await compressImage(file));
      setState({ busy: false, error: '' });
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(amount) > 0)) { setState({ busy: false, error: 'Enter the amount.' }); return; }
    if (requireReceipt && !receipt) { setState({ busy: false, error: 'Take a photo of the receipt.' }); return; }
    setState({ busy: true, error: '' });
    try {
      await onSubmit({ category, amount: Number(amount), date, note, receipt });
    } catch (err) {
      setState({ busy: false, error: err.message || 'Could not save.' });
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <form className="card" onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ maxWidth: '420px', width: '100%', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 style={{ fontWeight: 700, fontSize: '19px' }}>{title}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {MANUAL_EXPENSE_TYPES.map(t => {
            const on = category === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setCategory(t.id)} aria-pressed={on} style={{
                padding: '12px 4px', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                border: `2px solid ${on ? 'var(--accent-teal)' : 'var(--border)'}`,
                background: on ? 'var(--accent-teal)15' : 'var(--bg-elevated)',
                color: on ? 'var(--accent-teal)' : 'var(--text-primary)',
              }}>
                <div style={{ fontSize: '22px' }}>{t.icon}</div>{t.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label className="form-label">Amount</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
              <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={{ paddingLeft: '24px' }} autoFocus />
            </div>
          </div>
          <div>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={date} max={todayString()} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="form-label">Receipt{requireReceipt ? ' *' : ' (optional)'}</label>
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', minHeight: '90px', cursor: 'pointer',
            border: '2px dashed var(--border)', borderRadius: '10px', background: 'var(--bg-elevated)', overflow: 'hidden',
          }}>
            {receipt
              ? <img src={receipt} alt="Receipt" style={{ maxHeight: '180px', maxWidth: '100%', display: 'block' }} />
              : <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600 }}>📷 Take photo of receipt</span>}
            <input type="file" accept="image/*" capture="environment" onChange={pickPhoto} style={{ display: 'none' }} />
          </label>
          {receipt && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Tap the photo to retake.</div>}
        </div>

        <div>
          <label className="form-label">Note (optional)</label>
          <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder={category === 'gas' ? 'Station' : category === 'maintenance' ? 'Blades, oil change…' : 'What for?'} maxLength={200} />
        </div>

        {state.error && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{state.error}</div>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={state.busy} style={{ padding: '10px 22px' }}>
            {state.busy ? 'Working…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
