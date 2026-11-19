import { uid } from '../engine/uid';

/** A company kept in this browser: its own document key and its own database of uploaded files. */
export interface CompanyRef {
  id: string;
  name: string;
  stir: string;
  docKey: string;
  bankDb: string;
}

/** The part of localStorage the company list uses (a plain object in tests). */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const LIST_KEY = 'ochiq-hisob:companies';
const CURRENT_KEY = 'ochiq-hisob:current';
/** Where the single-company versions kept the document and the uploads; the first company keeps using them. */
export const LEGACY_DOC = 'ochiq-hisob:doc';
export const LEGACY_BANK = 'ochiq-hisob-bank';

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

/** The "unsaved to file" flag of a company's document. */
export const dirtyKey = (c: CompanyRef) => (c.docKey === LEGACY_DOC ? 'ochiq-hisob:dirty' : `${c.docKey}:dirty`);

function readList(kv: KV): CompanyRef[] {
  try {
    const list = JSON.parse(kv.getItem(LIST_KEY) ?? 'null') as CompanyRef[] | null;
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === 'string' && typeof c.docKey === 'string') : [];
  } catch {
    return [];
  }
}

function save(kv: KV, list: CompanyRef[], currentId?: string) {
  kv.setItem(LIST_KEY, JSON.stringify(list));
  if (currentId) kv.setItem(CURRENT_KEY, currentId);
}

/** Name and STIR written in a stored document, read loosely (the document may be from any version). */
function companyOf(kv: KV, docKey: string): { name: string; stir: string } {
  try {
    const c = JSON.parse(kv.getItem(docKey) ?? 'null')?.company;
    return { name: typeof c?.name === 'string' ? c.name : '', stir: typeof c?.stir === 'string' ? c.stir : '' };
  } catch {
    return { name: '', stir: '' };
  }
}

/**
 * The companies of this browser. The first time (no list yet) the existing document and uploads become the
 * first company where they are, nothing is copied.
 */
export function loadCompanies(kv: KV): { list: CompanyRef[]; currentId: string } {
  let list = readList(kv);
  if (!list.length) {
    const { name, stir } = companyOf(kv, LEGACY_DOC);
    list = [{ id: uid('c'), name, stir, docKey: LEGACY_DOC, bankDb: LEGACY_BANK }];
    save(kv, list, list[0].id);
  }
  const stored = kv.getItem(CURRENT_KEY);
  const currentId = list.some((c) => c.id === stored) ? stored! : list[0].id;
  return { list, currentId };
}

export function addCompanyTo(kv: KV, name: string, stir: string): CompanyRef {
  const list = loadCompanies(kv).list;
  const id = uid('c');
  const ref: CompanyRef = { id, name: name.trim(), stir: stir.trim(), docKey: `${LEGACY_DOC}:${id}`, bankDb: `${LEGACY_BANK}-${id}` };
  save(kv, [...list, ref]);
  return ref;
}

export function renameCompanyIn(kv: KV, id: string, name: string, stir: string): void {
  const list = loadCompanies(kv).list.map((c) => (c.id === id ? { ...c, name: name.trim(), stir: stir.trim() } : c));
  save(kv, list);
}

export function setCurrentCompany(kv: KV, id: string): void {
  kv.setItem(CURRENT_KEY, id);
}

/** Removes a company and its document (its uploads database is deleted by the caller). The last one stays. */
export function removeCompanyFrom(kv: KV, id: string): void {
  const { list, currentId } = loadCompanies(kv);
  const ref = list.find((c) => c.id === id);
  if (!ref) return;
  if (list.length <= 1) throw new Error('Oxirgi korxonani o‘chirib bo‘lmaydi.');
  const rest = list.filter((c) => c.id !== id);
  kv.removeItem(ref.docKey);
  kv.removeItem(dirtyKey(ref));
  save(kv, rest, currentId === id ? rest[0].id : currentId);
}
