/** Money and dates for the bank section: "1 234 567,89", negatives red in brackets, zero "–". */
export function fmtMoney(tiyin: number): string {
  if (!tiyin) return '–';
  const abs = Math.abs(Math.round(tiyin));
  const s = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + String(abs % 100).padStart(2, '0');
  return tiyin < 0 ? `(${s})` : s;
}

export function Money({ v, cur }: { v: number; cur?: string }) {
  return (
    <span className={v < 0 ? 'neg' : undefined} style={{ whiteSpace: 'nowrap' }}>
      {fmtMoney(v)}
      {cur && v !== 0 ? <span className="muted small"> {cur}</span> : null}
    </span>
  );
}

export const fmtDay = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
export const fmtMonth = (ym: string) => `${ym.slice(5, 7)}.${ym.slice(0, 4)}`;
export const fmtTime = (iso: string) => iso.slice(11, 16);

/** Small dependency-free line chart of daily balances. */
export function LineChart({ points, height = 160 }: { points: Array<{ date: string; balance: number }>; height?: number }) {
  if (points.length < 2) return <div className="muted small">Grafik uchun ma’lumot yetarli emas.</div>;
  const W = 800;
  const H = height;
  const P = 6;
  const vals = points.map((p) => p.balance);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const span = max - min || 1;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points.at(-1)!.date) || t0 + 1;
  const x = (d: string) => P + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - min) / span) * (H - 2 * P);
  let path = '';
  points.forEach((p, i) => {
    path += i === 0 ? `M${x(p.date)},${y(p.balance)}` : `H${x(p.date)}V${y(p.balance)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Qoldiq grafigi" preserveAspectRatio="none">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeDasharray="4 4" />
      <path d={path} fill="none" stroke="var(--brand-2)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <text x={P} y={12} fontSize="11" fill="var(--muted)">
        {fmtMoney(max)}
      </text>
      <text x={P} y={H - 2} fontSize="11" fill="var(--muted)">
        {fmtMoney(min)}
      </text>
    </svg>
  );
}

/** Grouped bars: debit and credit per month. */
export function BarChart({ rows }: { rows: Array<{ label: string; debit: number; credit: number }> }) {
  const W = 800;
  const H = 170;
  const max = Math.max(1, ...rows.flatMap((r) => [r.debit, r.credit]));
  const bw = (W - 20) / Math.max(1, rows.length);
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" height={H + 18} role="img" aria-label="Oylar bo‘yicha debet va kredit">
      {rows.map((r, i) => {
        const hD = (r.debit / max) * H;
        const hC = (r.credit / max) * H;
        const x0 = 10 + i * bw;
        return (
          <g key={r.label}>
            <rect x={x0 + bw * 0.12} y={H - hD} width={bw * 0.36} height={hD} fill="var(--kt)" opacity="0.8">
              <title>{`${r.label} debet: ${fmtMoney(r.debit)}`}</title>
            </rect>
            <rect x={x0 + bw * 0.52} y={H - hC} width={bw * 0.36} height={hC} fill="var(--ok)" opacity="0.8">
              <title>{`${r.label} kredit: ${fmtMoney(r.credit)}`}</title>
            </rect>
            <text x={x0 + bw / 2} y={H + 14} fontSize="11" textAnchor="middle" fill="var(--muted)">
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal share bar 0..1. */
export function ShareBar({ share, color = 'var(--brand-2)' }: { share: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 99, minWidth: 60 }}>
        <div style={{ width: `${Math.min(100, share * 100)}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span className="small" style={{ width: 48, textAlign: 'right' }}>
        {(share * 100).toFixed(1)}%
      </span>
    </div>
  );
}
