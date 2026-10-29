// A job's money laid out like an account statement: price, each cost, net.
const usd = n => `${n < 0 ? '−' : ''}$${Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CostSheet({ b, title = 'Per cut', note }) {
  const good = b.net >= 0;
  return (
    <div className="cost-sheet">
      <div className="cost-row head"><span>{title}</span><span /></div>
      <div className="cost-row"><span>Price</span><span>{usd(b.price)}</span></div>
      {b.lines.map(l => (
        <div key={l.label} className={l.muted ? 'cost-row muted' : 'cost-row'}><span>− {l.label}</span><span>{l.muted ? '—' : usd(l.amount)}</span></div>
      ))}
      <div className={`cost-row total ${good ? 'good' : 'bad'}`}><span>= Net per cut</span><span>{usd(b.net)} <small>({Math.round(b.margin * 100)}%)</small></span></div>
      <div className="cost-row sub"><span>Per month · ~{b.cutsPerMonth.toFixed(1)} cuts</span><span>{usd(b.perMonth)}</span></div>
      <div className="cost-row sub"><span>Per season</span><span>{usd(b.perSeason)}</span></div>
      {note && <div className="cost-note">{note}</div>}
    </div>
  );
}

