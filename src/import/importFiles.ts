import { isInvoiceSheet, parseInvoices, type Invoice } from '../audit/invoices';
import type { ParsedStatement } from '../bank/model';
import { parseStatements } from '../bank/parsers/detect';
import { readWorkbookRows } from '../bank/parsers/rows';
import { isGtdSheet, parseGtd, type GtdItem } from '../stock/gtd';
import { bankActions, beginUpload, type BankState, type FileResult } from '../ui/bank/bankStore';

export interface ImportSummary {
  statements: number;
  invoices: number;
  gtd: number;
  errors: Array<{ file: string; error: string }>;
}

type Counted = BankState['invoiceFiles'];

/** Reads any mix of bank statements, e-invoice registries (.xlsx or soliq.uz CSV) and GTD reports into the document store. */
export async function importFiles(files: Iterable<File>): Promise<ImportSummary> {
  const statements: ParsedStatement[] = [];
  const statementFiles: FileResult[] = [];
  const invoices: Invoice[] = [];
  const invoiceFiles: Counted = [];
  const gtd: GtdItem[] = [];
  const gtdFiles: Counted = [];
  const errors: ImportSummary['errors'] = [];
  const stillHere = beginUpload();

  for (const f of files) {
    try {
      if (!/\.(xlsx|csv)$/i.test(f.name)) throw new Error('Faqat .xlsx yoki .csv fayllar o‘qiladi.');
      const sheets = await readWorkbookRows(await f.arrayBuffer());
      const inv = sheets.filter(isInvoiceSheet);
      const g = sheets.filter(isGtdSheet);
      if (inv.length) {
        const list = inv.flatMap((s) => parseInvoices(s, f.name));
        invoices.push(...list);
        invoiceFiles.push({ file: f.name, ok: true, count: list.length });
      }
      if (g.length) {
        const list = g.flatMap((s) => parseGtd(s, f.name));
        gtd.push(...list);
        gtdFiles.push({ file: f.name, ok: true, count: list.length });
      }
      if (!inv.length && !g.length) {
        let sts: ParsedStatement[];
        try {
          sts = parseStatements(sheets, f.name);
        } catch {
          throw new Error('Bu fayl bank vipiskasi, hisob-faktura reyestri yoki GTD hisoboti emas.');
        }
        statements.push(...sts);
        statementFiles.push({ file: f.name, ok: true, accounts: sts.map((s) => ({ number: s.account.number, currency: s.account.currency, from: s.account.periodFrom, to: s.account.periodTo, count: s.operations.length })) });
      }
    } catch (e) {
      errors.push({ file: f.name, error: (e as Error).message });
    }
  }

  if (!(await stillHere())) return { statements: 0, invoices: 0, gtd: 0, errors: [{ file: '—', error: 'Yuklash vaqtida korxona almashtirildi — fayllar saqlanmadi, qayta yuklang.' }] };
  if (statementFiles.length) bankActions.addStatements(statements, statementFiles);
  if (invoiceFiles.length) bankActions.addInvoices(invoices, invoiceFiles);
  if (gtdFiles.length) bankActions.addGtd(gtd, gtdFiles);
  return { statements: statements.length, invoices: invoices.length, gtd: gtd.length, errors };
}
