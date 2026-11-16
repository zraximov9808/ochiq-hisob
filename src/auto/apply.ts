import type { Doc, Entry } from '../engine/types';
import type { BuiltAuto } from './build';
import { DEFAULT_AUTO } from './defaults';
import type { AutoSettings } from './types';

/** Settings of the document; a document saved before auto entries existed is filled automatically only when empty. */
export const autoSettings = (doc: Doc): AutoSettings => doc.auto ?? { ...DEFAULT_AUTO, enabled: !doc.entries.length && !doc.opening.length };

/**
 * Writes freshly built auto entries into the document (an immer draft): manual and hand-edited entries stay,
 * other auto entries are replaced, deleted sources stay deleted. An empty document takes its year and company from the data.
 */
export function applyAuto(d: Doc, built: BuiltAuto, inputHash: string): void {
  const s = autoSettings(d);
  const skip = new Set(s.skip);
  const edited = new Set(d.entries.filter((e) => e.auto?.edited).map((e) => e.auto!.src));
  const empty = !d.entries.some((e) => !e.auto) && !d.opening.length;

  const fresh: Entry[] = built.entries
    .filter((e) => !skip.has(e.auto!.src) && !edited.has(e.auto!.src))
    .map(({ fx: _fx, fxDebit: _d, fxCredit: _c, ...entry }) => entry);
  d.entries = [...d.entries.filter((e) => !e.auto || e.auto.edited), ...fresh];
  for (const sub of built.added) if (!d.subaccounts.some((x) => x.code === sub.code)) d.subaccounts.push(sub);

  if (empty && fresh.length) {
    const years = new Map<number, number>();
    for (const e of fresh) {
      const y = Number(e.date.slice(0, 4));
      years.set(y, (years.get(y) ?? 0) + 1);
    }
    d.year = [...years].sort((a, b) => b[1] - a[1])[0][0];
  }
  if (built.company) {
    if (!d.company.name) d.company.name = built.company.name;
    if (!d.company.stir) d.company.stir = built.company.inn;
  }
  d.auto = { ...s, inputHash };
}

/** The entry after a hand edit: an auto entry keeps its source and is marked edited so rebuilding leaves it alone. */
export function editedEntry(old: Entry, next: Entry): Entry {
  return old.auto ? { ...next, auto: { src: old.auto.src, edited: true } } : next;
}

/** Deletes an entry; a deleted auto entry's source is remembered so it does not come back. */
export function removeEntry(d: Doc, id: string): void {
  const e = d.entries.find((x) => x.id === id);
  if (!e) return;
  d.entries = d.entries.filter((x) => x.id !== id);
  if (e.auto) {
    const s = autoSettings(d);
    if (!s.skip.includes(e.auto.src)) d.auto = { ...s, skip: [...s.skip, e.auto.src] };
  }
}

/** Forgets deletions and hand edits of auto entries; the next build writes them all again. */
export function resetAuto(d: Doc): void {
  d.entries = d.entries.filter((e) => !e.auto);
  d.auto = { ...autoSettings(d), skip: [], inputHash: '' };
}
