import type ExcelJS from 'exceljs';
import type { Report } from '../engine/checks';
import type { Quarter } from '../engine/period';
import type { Reconciliation } from '../engine/reconciliation';
import type { Doc } from '../engine/types';
import { tr } from '../i18n/useT';
import { downloadBlob } from '../store/fileIO';
import { getState } from '../store/store';
import { buildAllWorkbook, buildFormWorkbook, buildReconWorkbook, type FormKind } from './workbooks';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const T = (s: string) => tr(s, getState().ui.script);
const NAMES: Record<FormKind, string> = { balance: '1-shakl-balans', income: '2-shakl-moliyaviy-natijalar', tax: 'foyda-soligi' };

function baseName(doc: Doc): string {
  return doc.company.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'hisobot';
}

async function save(wb: ExcelJS.Workbook, name: string) {
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: XLSX }), name);
}

export async function exportForm(kind: FormKind, doc: Doc, quarter: Quarter, r: Report) {
  await save(await buildFormWorkbook(kind, doc, quarter, r, T), `${baseName(doc)}-${NAMES[kind]}-${doc.year}-${quarter}.xlsx`);
}

/** The three official forms as three separate files. */
export async function exportOfficialForms(doc: Doc, quarter: Quarter, r: Report) {
  for (const kind of ['balance', 'income', 'tax'] as FormKind[]) {
    await exportForm(kind, doc, quarter, r);
    await new Promise((res) => setTimeout(res, 400));
  }
}

export async function exportAllReports(doc: Doc, quarter: Quarter, r: Report) {
  await save(await buildAllWorkbook(doc, quarter, r, T), `${baseName(doc)}-barcha-hisobotlar-${doc.year}-${quarter}.xlsx`);
}

export async function exportReconciliation(doc: Doc, group: { name: string; stir?: string; codes: string[] }, r: Reconciliation) {
  const who = group.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'kontragent';
  await save(await buildReconWorkbook(doc, group, r, T), `dalolatnoma-${who}-${doc.year}.xlsx`);
}
