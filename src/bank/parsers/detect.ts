import type { Cell, ParsedStatement } from '../model';
import { isFormatA, parseFormatA } from './formatA';
import { isFormatB, parseFormatB } from './formatB';

/** Recognises the layout of each worksheet and parses every statement found in the file. */
export function parseStatements(sheets: Cell[][][], file: string): ParsedStatement[] {
  const out: ParsedStatement[] = [];
  for (const rows of sheets) {
    if (isFormatA(rows)) out.push(parseFormatA(rows, file));
    else if (isFormatB(rows)) out.push(...parseFormatB(rows, file));
  }
  if (!out.length) throw new Error(`${file}: bu vipiska formati tanilmadi, namunani yuboring.`);
  return out;
}

/** First statement of a file (convenience for single-account exports). */
export function parseStatement(sheets: Cell[][][], file: string): ParsedStatement {
  return parseStatements(sheets, file)[0];
}
