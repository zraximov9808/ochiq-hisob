/** Amounts are stored as integer tiyin (1 so‘m = 100 tiyin). */
export type Unit = 'som' | 'ming';

const SPACES = /[\s\u00a0\u202f]/g;

export function parseAmount(input: string): number | null {
  const t = input.replace(SPACES, '').replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(t)) return null;
  const neg = t.startsWith('-');
  const [whole, frac = ''] = t.replace('-', '').split('.');
  const value = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -value : value;
}

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Rounds tiyin to whole thousands of so‘m, half away from zero. */
export function toMing(tiyin: number): number {
  const sign = tiyin < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(tiyin) / 100000);
}

export function formatAmount(tiyin: number, unit: Unit): string {
  const sign = tiyin < 0 ? '-' : '';
  if (unit === 'ming') {
    const v = toMing(tiyin);
    return v === 0 ? '0' : (v < 0 ? '-' : '') + group(Math.abs(v));
  }
  const abs = Math.abs(tiyin);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return sign + group(whole) + (frac ? ',' + String(frac).padStart(2, '0') : '');
}
