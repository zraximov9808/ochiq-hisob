import type { Cell } from '../bank/model';
import { cellText, moneyCell } from '../bank/parsers/rows';

/** One electronic invoice (счёт-фактура) from the registry export. Money in tiyin. */
export interface Invoice {
  id: string;
  docNo: string;
  date: string;
  kind: string;
  docType: string;
  status: string;
  contractNo: string;
  contractDate: string;
  sellerInn: string;
  sellerName: string;
  buyerInn: string;
  buyerName: string;
  amount: number;
  vat: number;
  total: number;
  lines: number;
  file: string;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function findHeader(rows: Cell[][]): number {
  return rows.slice(0, 15).findIndex((r) => {
    const t = r.map((c) => norm(cellText(c)));
    return t.some((x) => x.startsWith('продавец (инн')) && t.some((x) => x.startsWith('покупатель (инн'));
  });
}

export function isInvoiceSheet(rows: Cell[][]): boolean {
  return findHeader(rows) >= 0;
}

/** "dd-mm-yyyy" or "dd.mm.yyyy" → ISO day. */
function isoDay(v: Cell): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/.exec(cellText(v));
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

/** Parses the e-invoice registry: one record per document; multi-line documents carry totals on their "Общ." row. */
export function parseInvoices(rows: Cell[][], file: string): Invoice[] {
  const h = findHeader(rows);
  if (h < 0) throw new Error(`${file}: hisob-fakturalar ro‘yxati sarlavhasi topilmadi.`);
  const head = rows[h].map((c) => norm(cellText(c)));
  const col = (name: string, from = 0) => head.findIndex((x, i) => i >= from && x === norm(name));
  const starts = (name: string) => head.findIndex((x) => x.startsWith(norm(name)));
  const C = {
    id: col('ID'),
    kind: col('Вид документ'),
    type: col('ТИП документ'),
    status: col('СТАТУС'),
    no: col('Номер документ'),
    date: col('Дата документ'),
    contractNo: col('Договор номер'),
    contractDate: col('Договор дата'),
    sellerInn: starts('Продавец (ИНН'),
    sellerName: col('Продавец (наименование)'),
    buyerInn: starts('Покупатель (ИНН'),
    buyerName: col('Покупатель (наименование)'),
    amount: col('Стоимость поставки'),
    vat: col('НДС сумма'),
    total: starts('Стоимость поставки с учетом НДС') >= 0 ? starts('Стоимость поставки с учетом НДС') : starts('Стоимость поставки с учётом НДС'),
  };
  const lineNoCol = head.findIndex((x, i) => i > C.id && x === '№');
  if (C.id < 0 || C.total < 0 || C.no < 0) throw new Error(`${file}: hisob-faktura ustunlari to‘liq emas (ID, raqam yoki jami summa topilmadi).`);

  const out: Invoice[] = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const id = cellText(row[C.id]);
    if (!id) {
      if (out.length && row.some((c) => cellText(c) !== '')) out[out.length - 1].lines++;
      continue;
    }
    const money = (i: number) => (i < 0 ? 0 : moneyCell(row[i]) ?? 0);
    const t = (i: number) => (i < 0 ? '' : cellText(row[i]));
    // The second "№" column numbers the goods; "Общ." there marks a totals row followed by item rows.
    const firstLine = lineNoCol >= 0 && cellText(row[lineNoCol]) === 'Общ.' ? 0 : 1;
    out.push({
      id,
      docNo: t(C.no),
      date: isoDay(row[C.date]),
      kind: t(C.kind),
      docType: t(C.type),
      status: t(C.status),
      contractNo: t(C.contractNo),
      contractDate: isoDay(row[C.contractDate]),
      sellerInn: t(C.sellerInn),
      sellerName: t(C.sellerName),
      buyerInn: t(C.buyerInn),
      buyerName: t(C.buyerName),
      amount: money(C.amount),
      vat: money(C.vat),
      total: money(C.total),
      lines: firstLine,
      file,
    });
  }
  return out;
}

/** The reporting company: the INN that appears on every invoice (as seller or buyer). */
export function companyInnOf(invoices: Invoice[]): string {
  const count = new Map<string, number>();
  for (const i of invoices) for (const inn of new Set([i.sellerInn, i.buyerInn])) if (inn) count.set(inn, (count.get(inn) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}
