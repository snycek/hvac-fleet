import { useEffect, useRef, useState } from 'react';
import { fetchAddressSuggestions } from '../lib/zones.js';

/**
 * Street address field with suggestions as you type.
 * onPick receives { address, city, zip, lat, lng, exact } when a suggestion is chosen.
 */
export default function AddressInput({ value, onChange, onPick, placeholder, required }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const inFlight = useRef(null);

  const cancelLookup = () => {
    clearTimeout(timer.current);
    inFlight.current?.abort();
  };

  // Stop any pending search if the field goes away.
  useEffect(() => cancelLookup, []);

  const lookup = (raw) => {
    cancelLookup();
    const text = raw.trim();
    if (text.length < 3) { setSuggestions([]); setLoading(false); return; }
    setLoading(true);
    // Wait until typing pauses so we don't hit the search on every key.
    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      inFlight.current = controller;
      try {
        const list = await fetchAddressSuggestions(text, controller.signal);
        setSuggestions(Array.isArray(list) ? list : []);
        setActive(-1);
        setLoading(false);
      } catch (err) {
        if (err.name !== 'AbortError') { setSuggestions([]); setLoading(false); }
      }
    }, 300);
  };

  const pick = (s) => {
    cancelLookup();
    onPick(s);
    setSuggestions([]);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const showList = open && value.trim().length >= 3 && (suggestions.length > 0 || !loading);

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="form-input"
        name="address"
        value={value}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        aria-controls="address-suggestions"
        aria-activedescendant={active >= 0 ? `address-option-${active}` : undefined}
        onChange={e => { onChange(e.target.value); setOpen(true); lookup(e.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          id="address-suggestions"
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1000,
            listStyle: 'none', margin: 0, padding: '4px',
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)', maxHeight: '280px', overflowY: 'auto',
          }}
        >
          {suggestions.length === 0 ? (
            <li style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--text-muted)' }}>
              No matches yet — keep typing, or just enter your full address.
            </li>
          ) : suggestions.map((s, i) => (
            <li
              key={s.label}
              id={`address-option-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '9px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'baseline',
                background: i === active ? 'var(--bg-elevated)' : 'transparent',
              }}
            >
              <span style={{ fontSize: '14px' }}>📍</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.address}</span>
                <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)' }}>{[s.city, 'MI', s.zip].filter(Boolean).join(', ')}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
