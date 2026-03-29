export default function StatusBadge({ label, color, size = 'sm' }) {
  const pad = size === 'lg' ? '6px 14px' : '3px 10px';
  const fontSize = size === 'lg' ? '13px' : '11px';
  return (
    <span style={{
      display: 'inline-block',
      background: color + '22',
      color,
      border: `1px solid ${color}55`,
      borderRadius: '20px',
      padding: pad,
      fontSize,
      fontWeight: 600,
      letterSpacing: '0.3px',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
