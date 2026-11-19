import { DEFAULT_AUTO } from '../auto/defaults';
import { emptyDoc, type Doc } from '../engine/types';

export const FILE_EXT = '.ohisob';

/** Typed form values as stored: "form:quarter" → line → column → number; anything else in the file is dropped. */
function formValues(raw: unknown): Doc['forms'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<Doc['forms']> = {};
  for (const [key, lines] of Object.entries(raw)) {
    if (!lines || typeof lines !== 'object') continue;
    for (const [line, cols] of Object.entries(lines)) {
      if (!cols || typeof cols !== 'object') continue;
      for (const [col, v] of Object.entries(cols))
        if (typeof v === 'number' && Number.isFinite(v)) ((out[key] ??= {})[line] ??= {})[col] = Math.round(v);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function formNameValues(raw: unknown): Doc['formNames'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<Doc['formNames']> = {};
  for (const [key, names] of Object.entries(raw)) {
    if (!names || typeof names !== 'object') continue;
    for (const [line, name] of Object.entries(names)) if (typeof name === 'string' && name.trim()) (out[key] ??= {})[line] = name;
  }
  return Object.keys(out).length ? out : undefined;
}

export function serializeDoc(doc: Doc): string {
  return JSON.stringify(doc, null, 1);
}

/** Parses a saved document, filling fields that older files may lack. */
export function parseDocFile(text: string): Doc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Faylni o‘qib bo‘lmadi: u JSON formatida emas.');
  }
  const r = raw as Partial<Doc> | null;
  if (!r || typeof r !== 'object' || r.app !== 'ochiq-hisob') throw new Error('Bu Ochiq Hisob fayli emas.');
  if (typeof r.year !== 'number') throw new Error('Faylda hisobot yili ko‘rsatilmagan.');
  const base = emptyDoc(r.year);
  return {
    ...base,
    ...r,
    company: { ...base.company, ...(r.company ?? {}), codes: { ...(r.company?.codes ?? {}) } },
    opening: Array.isArray(r.opening) ? r.opening : [],
    entries: Array.isArray(r.entries) ? r.entries : [],
    subaccounts: Array.isArray(r.subaccounts) ? r.subaccounts : [],
    templates: Array.isArray(r.templates) ? r.templates : [],
    prevYear: r.prevYear ?? {},
    taxRate: typeof r.taxRate === 'number' ? r.taxRate : 15,
    auto: r.auto && typeof r.auto === 'object' ? { ...DEFAULT_AUTO, ...r.auto } : undefined,
    forms: formValues(r.forms),
    formNames: formNameValues(r.formNames),
    // a file without the mark was written on the previous chart
    chart: r.chart === '1c' ? '1c' : undefined,
  } as Doc;
}

export function suggestedFileName(doc: Doc): string {
  const name = doc.company.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'hisob';
  return `${name}-${doc.year}${FILE_EXT}`;
}
