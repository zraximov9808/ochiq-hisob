import { expect, test } from 'vitest';
import { autoKind, AUTO_KIND_LABEL } from './labels';

test('auto entry sources are grouped into kinds with Uzbek labels', () => {
  expect(autoKind('bank:abc')).toBe('bank');
  expect(autoKind('bank:abc:capital')).toBe('capital');
  expect(autoKind('inv:id1:cogs')).toBe('cogs');
  expect(autoKind('inv:id1:vat')).toBe('invoice');
  expect(autoKind('gtd:0001:duty')).toBe('gtd');
  expect(autoKind('pair:op1')).toBe('pair');
  expect(autoKind('vat:2026-07')).toBe('vat');
  expect(autoKind('reval:5210.01:USD:2026-07')).toBe('reval');
  expect(AUTO_KIND_LABEL.cogs).toBe('Tannarx');
});
