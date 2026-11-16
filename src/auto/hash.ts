/** FNV-1a (52 bits, base36) of the JSON form — a short fingerprint of the auto-entry inputs. */
export function autoInputHash(x: unknown): string {
  const s = JSON.stringify(x) ?? '';
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h1 >>> 0) * 0x100000 + ((h2 >>> 0) & 0xfffff)).toString(36);
}
