import { describe, expect, test } from 'vitest';
import { readWorkbookRows } from './rows';

/** Windows-1251 bytes for the characters these tests use (ASCII, А–я, Ё/ё, №). */
function cp1251(text: string): ArrayBuffer {
  const bytes = Array.from(text).map((ch) => {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) return c;
    if (c >= 0x410 && c <= 0x44f) return c - 0x410 + 0xc0;
    if (c === 0x401) return 0xa8;
    if (c === 0x451) return 0xb8;
    if (c === 0x2116) return 0xb9;
    throw new Error(`no cp1251 byte for ${ch}`);
  });
  return new Uint8Array(bytes).buffer;
}

const utf8 = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('readWorkbookRows on text files', () => {
  test('reads a cp1251 semicolon CSV as one sheet', async () => {
    const sheets = await readWorkbookRows(cp1251('№;ID;СТАТУС\r\n1;abc;Подтверждён\r\n'));
    expect(sheets).toEqual([[['№', 'ID', 'СТАТУС'], ['1', 'abc', 'Подтверждён']]]);
  });

  test('doubled quotes inside a quoted field become one quote', async () => {
    const [rows] = await readWorkbookRows(cp1251('a;b\r\n"""ACME"" MCHJ";x\r\n'));
    expect(rows[1]).toEqual(['"ACME" MCHJ', 'x']);
  });

  test('reads a UTF-8 CSV with a byte-order mark', async () => {
    const [rows] = await readWorkbookRows(utf8('﻿СТАТУС;СУММА\nОжидает;12,5\n'));
    expect(rows).toEqual([['СТАТУС', 'СУММА'], ['Ожидает', '12,5']]);
  });
});
