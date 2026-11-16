export type AutoKind = 'bank' | 'capital' | 'invoice' | 'cogs' | 'gtd' | 'pair' | 'vat' | 'reval';

export const AUTO_KIND_LABEL: Record<AutoKind, string> = {
  bank: 'Bank',
  capital: 'Ustav kapitali',
  invoice: 'Faktura',
  cogs: 'Tannarx',
  gtd: 'GTD',
  pair: 'Valyuta farqi',
  vat: 'QQS zachyoti',
  reval: 'Qayta baholash',
};

/** Kind of an auto entry from its source key. */
export function autoKind(src: string): AutoKind {
  const [head, , part] = src.split(':');
  if (head === 'bank') return part === 'capital' ? 'capital' : 'bank';
  if (head === 'inv') return part === 'cogs' ? 'cogs' : 'invoice';
  if (head === 'gtd' || head === 'pair' || head === 'vat' || head === 'reval') return head;
  return 'bank';
}
