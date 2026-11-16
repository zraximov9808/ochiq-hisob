import type { Cell } from '../bank/model';
import { cellText, moneyCell } from '../bank/parsers/rows';

/** One good from a customs declaration (ГТД) report. */
export interface GtdItem {
  id: string;
  date: string;
  gtdNo: string;
  itemNo: string;
  regime: string;
  sender: string;
  name: string;
  hsCode: string;
  ikpu: string;
  unit: string;
  /** Number of units; null when neither the quantity column nor the description gives it. */
  qty: number | null;
  /** Number of packages (гр.6 Кол-во мест). */
  places: number | null;
  /** Contract currency as written (гр.22), e.g. "840"; '' when the report has no such column. */
  currency: string;
  /** Contract currency rate (гр.23), so‘m per unit. */
  rate: number | null;
  /** Invoice value of the good (гр.42) in minor units (cents) of the contract currency. */
  invoiceValue: number | null;
  /** Customs fee and inspection charge (гр.47-1), tiyin. */
  fees: number;
  /** Duty, extra duty, excise and other payments (гр.47-1), tiyin. */
  duty: number;
  /** Import VAT (гр.47-1), tiyin. */
  importVat: number;
  file: string;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function findHeader(rows: Cell[][]): number {
  return rows.slice(0, 10).findIndex((r) => {
    const t = r.map((c) => norm(cellText(c)));
    return t.some((x) => x.includes('справочный номер')) && t.some((x) => x.includes('наименовани') && x.includes('товара'));
  });
}

export function isGtdSheet(rows: Cell[][]): boolean {
  return findHeader(rows) >= 0;
}

const num = (v: Cell): number | null => {
  if (typeof v === 'number') return v;
  const s = cellText(v).replace(/[\s ]/g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

/** Quantity from the description: the last "кол. N" / "Кол-во N". */
export function qtyFromText(text: string): number | null {
  const all = [...text.matchAll(/кол(?:-во|\.)?\s*(\d[\d\s]*)/gi)];
  const last = all.at(-1);
  return last ? Number(last[1].replace(/\s/g, '')) : null;
}

const isoDay = (v: Cell) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(cellText(v));
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};

/** Parses the "Отчет о таможенном оформлении товаров" template: one row per good. */
export function parseGtd(rows: Cell[][], file: string): GtdItem[] {
  const h = findHeader(rows);
  if (h < 0) throw new Error(`${file}: GTD hisobot sarlavhasi topilmadi.`);
  const head = rows[h].map((c) => norm(cellText(c)));
  const has = (...parts: string[]) => head.findIndex((x) => parts.every((p) => x.includes(p)));
  const C = {
    regime: has('ежима'),
    date: has('дата регистрации'),
    no: has('справочный номер'),
    sender: has('отправитель'),
    itemNo: has('№ товара'),
    hs: has('код товара'),
    name: head.findIndex((x) => x.includes('наименовани') && x.includes('товара')),
    ikpu: has('икпу'),
    places: has('кол-во мест'),
    unit: head.findIndex((x) => x.startsWith('ед. изм') || x.startsWith('ед.изм')),
    qty: head.findIndex((x) => x === 'кол-во' || x === 'количество'),
    currency: has('валюта контракта'),
    rate: has('курс валюты контракта'),
    value: has('фактурная стоимость'),
  };
  // Customs payments: the "Сумма" columns of block 47-1 (47-2 holds deferred/exempt amounts and is not used).
  const pay = (...names: string[]) => head.flatMap((x, i) => (x.includes('47-1') && x.includes('сумма') && names.some((n) => x.includes(n)) ? [i] : []));
  const P = { fees: pay('сбор', 'досмотр'), duty: pay('пошлина', 'акциз', 'иные'), vat: pay('ндс') };
  const out: GtdItem[] = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const t = (i: number) => (i < 0 ? '' : cellText(row[i]));
    const gtdNo = t(C.no);
    const name = t(C.name);
    if (!gtdNo || !name) continue;
    const itemNo = t(C.itemNo) || String(out.filter((g) => g.gtdNo === gtdNo).length + 1);
    const sum = (cols: number[]) => cols.reduce((s, i) => s + (moneyCell(row[i]) ?? 0), 0);
    const value = C.value >= 0 ? num(row[C.value]) : null;
    out.push({
      id: `gtd:${gtdNo}:${itemNo}`,
      date: isoDay(row[C.date]),
      gtdNo,
      itemNo,
      regime: t(C.regime),
      sender: t(C.sender),
      name,
      hsCode: t(C.hs),
      ikpu: t(C.ikpu),
      unit: t(C.unit) === '.' ? '' : t(C.unit),
      qty: (C.qty >= 0 ? num(row[C.qty]) : null) ?? qtyFromText(name),
      places: C.places >= 0 ? num(row[C.places]) : null,
      currency: t(C.currency),
      rate: C.rate >= 0 ? num(row[C.rate]) : null,
      invoiceValue: value === null ? null : Math.round(value * 100),
      fees: sum(P.fees),
      duty: sum(P.duty),
      importVat: sum(P.vat),
      file,
    });
  }
  return out;
}
