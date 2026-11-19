import type { ColumnDef } from './types';

export type HeadCell = { key: string; text: string; colSpan: number; rowSpan: number };

/** Header rows as on the template: "A / B / C" labels merge the columns that share a part. */
export function headerRows(cols: ColumnDef[]): HeadCell[][] {
  const parts = cols.map((c) => {
    const p = c.label.split(' / ').map((x) => x.trim()).filter(Boolean);
    return p.length ? p : [''];
  });
  const depth = Math.max(1, ...parts.map((p) => p.length));
  const rows: HeadCell[][] = Array.from({ length: depth }, () => []);
  const same = (a: string[], b: string[], k: number) => a.slice(0, k + 1).join('\u0000') === b.slice(0, k + 1).join('\u0000');
  for (let k = 0; k < depth; k++) {
    let i = 0;
    while (i < cols.length) {
      const p = parts[i];
      if (p.length <= k) {
        i++;
        continue;
      }
      if (k === p.length - 1) {
        rows[k].push({ key: `${k}-${i}`, text: p[k], colSpan: 1, rowSpan: depth - k });
        i++;
        continue;
      }
      let j = i + 1;
      while (j < cols.length && parts[j].length > k + 1 && same(parts[j], p, k)) j++;
      rows[k].push({ key: `${k}-${i}`, text: p[k], colSpan: j - i, rowSpan: 1 });
      i = j;
    }
  }
  return rows;
}
