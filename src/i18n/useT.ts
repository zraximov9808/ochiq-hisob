import { useApp } from '../store/store';
import { toCyrillic } from './translit';

const cache = new Map<string, string>();

export function tr(text: string, script: 'lat' | 'cyr'): string {
  if (script === 'lat' || !text) return text;
  let v = cache.get(text);
  if (v === undefined) {
    v = toCyrillic(text);
    if (cache.size > 5000) cache.clear();
    cache.set(text, v);
  }
  return v;
}

/** Returns t(text): the UI text in the chosen script (Latin source, Cyrillic by transliteration). */
export function useT(): (text: string) => string {
  const { ui } = useApp();
  return (text: string) => tr(text, ui.script);
}
