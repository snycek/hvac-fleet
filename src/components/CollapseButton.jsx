/** Small ▾ / ▸ toggle used in hub panel title bars. */
export default function CollapseButton({ collapsed, onToggle, label }) {
  return (
    <button type="button" className="collapse-btn" onClick={onToggle}
      aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`} title={collapsed ? 'Expand' : 'Collapse'}>
      {collapsed ? '▸' : '▾'}
    </button>
  );
}
