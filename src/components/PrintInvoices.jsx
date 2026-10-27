import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import InvoiceSheet from './InvoiceSheet.jsx';

/**
 * Preview + print a stack of paper invoices (one per page). Rendered straight into
 * <body> so print CSS can hide the rest of the app.
 * items: [{ key, invoice, payUrl, crew }]
 */
export default function PrintInvoices({ items, title, onClose }) {
  const [qrs, setQrs] = useState({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(items.map(it => QRCode.toDataURL(it.payUrl, { margin: 1, width: 480, errorCorrectionLevel: it.payUrl.length > 160 ? 'L' : 'M' }).then(url => [it.key, url])))
      .then(pairs => { if (!cancelled) setQrs(Object.fromEntries(pairs)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [items]);
  const ready = items.every(it => qrs[it.key]);

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="print-root" role="dialog" aria-label={title}>
      <div className="print-toolbar">
        <b>🖨 {title}</b>
        <span>{items.length} invoice{items.length === 1 ? '' : 's'} · one per page</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn-primary" disabled={!ready} onClick={() => window.print()}>{ready ? 'Print' : 'Making QR codes…'}</button>
        <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
      </div>
      <div className="print-pages">
        {items.length === 0 && <div className="print-empty">No visits to invoice.</div>}
        {items.map(it => <InvoiceSheet key={it.key} invoice={it.invoice} qr={qrs[it.key]} payUrl={it.payUrl} crew={it.crew} />)}
      </div>
    </div>,
    document.body,
  );
}
