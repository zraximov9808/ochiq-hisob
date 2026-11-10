/** Uzbek Latin → Cyrillic transliteration for UI text. */
const APOS = new Set(["'", '‘', '’', 'ʻ', 'ʼ', '`']);
const LETTERS: Record<string, string> = {
  a: 'а', b: 'б', c: 'с', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л',
  m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х',
  y: 'й', z: 'з',
};
const Y_PAIRS: Record<string, string> = { o: 'ё', u: 'ю', a: 'я', e: 'е' };
const PROTECTED = /(\b(?:Excel|xlsx|Ctrl|JSON|PDF|ohisob)\b)/;
const isLetter = (ch: string) => /[A-Za-zА-яЁёЎўҚқҒғҲҳ]/.test(ch) || APOS.has(ch);

function convert(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const lc = c.toLowerCase();
    const upper = c !== lc;
    const next = (s[i + 1] ?? '').toLowerCase();
    const emit = (cyr: string) => {
      out += upper ? cyr.toUpperCase() : cyr;
    };
    if ((lc === 'o' || lc === 'g') && APOS.has(s[i + 1] ?? '')) {
      emit(lc === 'o' ? 'ў' : 'ғ');
      i++;
    } else if (lc === 's' && next === 'h') {
      emit('ш');
      i++;
    } else if (lc === 'c' && next === 'h') {
      emit('ч');
      i++;
    } else if (lc === 'y' && next in Y_PAIRS && !(next === 'o' && APOS.has(s[i + 2] ?? ''))) {
      emit(Y_PAIRS[next]);
      i++;
    } else if (lc === 'e' && !isLetter(s[i - 1] ?? '')) {
      emit('э');
    } else if (APOS.has(c) && isLetter(s[i - 1] ?? '')) {
      out += 'ъ';
    } else if (lc in LETTERS) {
      emit(LETTERS[lc]);
    } else {
      out += c;
    }
  }
  return out;
}

export function toCyrillic(text: string): string {
  return text
    .split(PROTECTED)
    .map((part, idx) => (idx % 2 === 1 ? part : convert(part)))
    .join('');
}
