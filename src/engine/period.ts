export type Quarter = 1 | 2 | 3 | 4;

export interface Period {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Reporting periods are cumulative from 1 January to the quarter end. */
export function periodRange(year: number, quarter: Quarter): Period {
  const endMonth = quarter * 3;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return { from: `${year}-01-01`, to: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Accepts dd.mm.yyyy, dd/mm/yyyy or yyyy-mm-dd; returns ISO or null. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
