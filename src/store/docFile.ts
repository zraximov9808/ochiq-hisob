import { DEFAULT_AUTO } from '../auto/defaults';
import { emptyDoc, type Doc } from '../engine/types';

export const FILE_EXT = '.ohisob';

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
    company: { ...base.company, ...(r.company ?? {}) },
    opening: Array.isArray(r.opening) ? r.opening : [],
    entries: Array.isArray(r.entries) ? r.entries : [],
    subaccounts: Array.isArray(r.subaccounts) ? r.subaccounts : [],
    templates: Array.isArray(r.templates) ? r.templates : [],
    prevYear: r.prevYear ?? {},
    taxRate: typeof r.taxRate === 'number' ? r.taxRate : 15,
    auto: r.auto && typeof r.auto === 'object' ? { ...DEFAULT_AUTO, ...r.auto } : undefined,
  } as Doc;
}

export function suggestedFileName(doc: Doc): string {
  const name = doc.company.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'hisob';
  return `${name}-${doc.year}${FILE_EXT}`;
}
