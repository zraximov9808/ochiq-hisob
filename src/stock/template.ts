import ExcelJS from 'exceljs';

/** Columns of the import (GTD) template, named the way the parser recognises them. */
export const GTD_TEMPLATE_COLUMNS: Array<{ header: string; width: number; hint: string; text?: boolean; date?: boolean }> = [
  { header: 'гр.1 Тип режима', width: 12, hint: 'ИМ 40 — import (kirim), ЭК 10 — eksport (chiqim)' },
  { header: 'гр.7 Дата регистрации ГТД', width: 14, hint: 'kk.oo.yyyy', date: true },
  { header: 'гр.7 Справочный номер ГТД', width: 14, hint: 'GTD raqami, masalan 0012990', text: true },
  { header: 'гр.2 Отправитель', width: 30, hint: 'Yuboruvchi (yetkazib beruvchi)' },
  { header: 'гр.32 № товара', width: 9, hint: 'GTD ichidagi tovar raqami: 1, 2, 3…' },
  { header: 'гр.33 Код товара', width: 14, hint: 'TN VED kodi', text: true },
  { header: 'гр.31 Наименование товара', width: 60, hint: 'Tovar nomi — sotuv fakturasidagi nom bilan bir xil yozing' },
  { header: 'гр.44 п.875 ИКПУ', width: 20, hint: 'ИКПУ kodi (17 xona)', text: true },
  { header: 'гр.6 Кол-во мест', width: 11, hint: 'Joylar (qadoqlar) soni — ixtiyoriy' },
  { header: 'ед. изм.', width: 10, hint: 'шт, комплект, кг…' },
  { header: 'кол-во', width: 11, hint: 'Tovar soni — omborga shu son kiradi' },
  { header: 'гр.22 Валюта контракта', width: 11, hint: 'Ixtiyoriy: valyuta kodi, masalan 840 (USD)', text: true },
  { header: 'гр.23 Курс валюты контракта', width: 13, hint: 'Ixtiyoriy: GTD sanasidagi kurs (so‘m)' },
  { header: 'гр.42 Фактурная стоимость товара', width: 15, hint: 'Ixtiyoriy: tovarning fakturaviy qiymati (kontrakt valyutasida) — tannarx uchun' },
  { header: 'гр. 47-1 Сбор (10) Сумма', width: 14, hint: 'Ixtiyoriy: bojxona yig‘imi (so‘m)' },
  { header: 'гр.47-1 Пошлина (20) Сумма', width: 14, hint: 'Ixtiyoriy: boj (so‘m)' },
  { header: 'гр. 47-1 НДС (29) Сумма', width: 14, hint: 'Ixtiyoriy: import QQS (so‘m)' },
];

const ROWS = 500;

/** Empty import (GTD) template plus an instructions sheet; the example lives only on the instructions sheet. */
export async function buildGtdTemplate(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ochiq Hisob';
  const ws = wb.addWorksheet('GTD');
  ws.columns = GTD_TEMPLATE_COLUMNS.map((c) => ({ width: c.width }));
  ws.getCell('A1').value = 'Отчет о таможенном оформлении товаров (Ochiq Hisob shabloni — 3-qatordan boshlab to‘ldiring)';
  ws.getCell('A1').font = { bold: true, size: 12 };
  const head = ws.getRow(2);
  GTD_TEMPLATE_COLUMNS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.note = c.hint;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  head.height = 32;
  GTD_TEMPLATE_COLUMNS.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.text) col.numFmt = '@';
    if (c.date) col.numFmt = 'dd.mm.yyyy';
  });
  for (let r = 3; r < ROWS + 3; r++) {
    ws.getCell(r, 1).dataValidation = { type: 'list', allowBlank: true, formulae: ['"ИМ 40,ИМ 41,ЭК 10"'] };
  }
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  const help = wb.addWorksheet('Yo‘riqnoma');
  help.columns = [{ width: 24 }, { width: 90 }];
  const lines: Array<[string, string]> = [
    ['Ochiq Hisob — Ombor', 'Import tovarlar (GTD) shabloni'],
    ['', ''],
    ['1.', '“GTD” varag‘iga har bir tovarni alohida qatorga yozing (3-qatordan boshlab). Sarlavhalarni o‘zgartirmang.'],
    ['2.', '“кол-во” ustuniga tovar sonini yozing — omborga shu son kiradi. Soni noma’lum bo‘lsa, bo‘sh qoldiring: ilovada keyin kiritasiz.'],
    ['3.', 'Tovar nomini sotuv (chiqim) fakturasidagi nom bilan bir xil yozing — ilova tovarlarni nom bo‘yicha bog‘laydi.'],
    ['4.', '“ИМ 40” — import (kirim). Eksport uchun “ЭК 10” (chiqim) tanlang.'],
    ['5.', 'Faylni saqlab, Ombor bo‘limiga kirim/chiqim faktura reyestrlari bilan birga tashlang.'],
    ['6.', 'Valyuta, kurs, fakturaviy qiymat va to‘lov ustunlari ixtiyoriy: to‘ldirilsa, ilova import provodkalarini va sotilgan tovar tannarxini hisoblaydi.'],
    ['Namuna (bu varaq import qilinmaydi):', ''],
  ];
  lines.forEach((l, i) => {
    help.getRow(i + 1).values = l;
  });
  help.getCell('A1').font = { bold: true, size: 13 };
  help.getCell('A9').font = { bold: true };
  const ex = help.getRow(10);
  ex.values = ['Rejim / Sana / GTD', 'Yuboruvchi · № · Kod · Nomi · ИКПУ · Joylar · Birlik · Soni'];
  ex.font = { bold: true };
  help.getRow(11).values = ['ИМ 40 / 15.06.2026 / 0000123', 'SUPPLIER CO., LTD · 1 · 6910900000 · Унитаз керамический в одном корпусе с бачком · 06910001001000000 · 12 · шт · 335'];
  help.getRow(12).values = ['ИМ 40 / 15.06.2026 / 0000123', 'SUPPLIER CO., LTD · 2 · 6910900000 · Раковина керамическая с ножкой · 06910001001000000 · 5 · шт · 50'];
  return wb;
}
