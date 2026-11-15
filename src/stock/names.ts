/**
 * Product names come from customs declarations ("Russian / English - кол. 420 шт, вес: …") and from
 * invoices (usually the Russian part only). The key keeps the Russian part without quantity, maker,
 * weight or trailing punctuation, so the same good matches across documents.
 */
const NOTES = [/\s*\.?\s*кол-во.*$/i, /\s+-\s*кол\..*$/i, /\s*\.?\s*изг\.?:.*$/i, /\s*\.?\s*про:.*$/i, /\s*[-,]\s*вес:.*$/i];

const cyrillic = (s: string) => (s.match(/[а-яёўқғҳ]/gi) ?? []).length;

function cleanPart(p: string): string {
  let s = p;
  for (const re of NOTES) s = s.replace(re, '');
  return s.replace(/[\s.,;:]+$/, '').trim();
}

/** The Russian, note-free part of a product name in its original spelling. */
export function productDisplay(name: string): string {
  const parts = name.split(/\s+\/\s+/).map(cleanPart).filter(Boolean);
  if (!parts.length) return name.trim();
  return parts.reduce((best, p) => (cyrillic(p) > cyrillic(best) ? p : best), parts[0]);
}

export function productKey(name: string): string {
  return productDisplay(name)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/["«»“”]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:]+$/, '')
    .trim();
}

/** Edit distance, stopping early once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Joins keys that differ by a typo (at most 2 characters, names of 20+ characters) into the key used
 * most often. Returns a map from every key to its canonical key.
 */
export function mergeSimilarKeys(counts: Map<string, number>): Map<string, string> {
  const keys = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || b.length - a.length);
  const canon = new Map<string, string>();
  for (const k of keys) {
    const target = k.length >= 20 ? keys.find((c) => canon.get(c) === c && c.length >= 20 && c !== k && editDistance(c, k) <= 2) : undefined;
    canon.set(k, target ?? k);
  }
  return canon;
}
