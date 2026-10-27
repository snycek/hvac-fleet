import { useCallback, useEffect, useState } from 'react';

// Expenses (gas, maintenance, other). Kept on our server; refreshed every few seconds
// so a foreman's receipt shows up in the owner's To-Do without a reload.
export function useExpenses({ poll = true } = {}) {
  const [expenses, setExpenses] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/expenses');
      if (res.ok) setExpenses(await res.json());
    } catch { /* offline: keep what we have */ }
  }, []);

  useEffect(() => {
    if (!poll) return undefined;
    const first = setTimeout(load, 0);
    const id = setInterval(load, 5000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [load, poll]);

  const send = async (url, method, body) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
    return data;
  };

  // { techId, category, amount, date, note, receipt (data URL), logNow }
  const addExpense = useCallback(async (expense) => {
    const created = await send('/api/expenses', 'POST', expense);
    setExpenses(prev => [created, ...prev]);
    return created;
  }, []);

  const logExpense = useCallback(async (id, changes) => {
    const updated = await send(`/api/expenses/${id}/log`, 'PUT', changes);
    setExpenses(prev => prev.map(e => (e.id === id ? updated : e)));
  }, []);

  const rejectExpense = useCallback(async (id) => {
    const updated = await send(`/api/expenses/${id}/reject`, 'PUT');
    setExpenses(prev => prev.map(e => (e.id === id ? updated : e)));
  }, []);

  return { expenses, addExpense, logExpense, rejectExpense, reload: load };
}

export const receiptUrl = id => `/api/expenses/${id}/receipt`;

// Shrink a phone photo to a small JPEG before upload (receipts stay readable at ~1400px).
export function compressImage(file, maxSide = 1400, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a photo.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
