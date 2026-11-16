# Avto-provodka va Ombor tovar filtri — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bank vipiskalari, e-faktura reyestrlari (.xlsx va soliq.uz CSV) va GTD yuklanganda provodkalar jurnalga avtomatik tushadi va balans / 2-shakl / foyda solig‘i shu provodkalardan to‘ladi; Omborda tovar nomi filtri va GTD talabi.

**Architecture:** `src/auto/` — sof funksiyalar: manbalardan “qoralama” provodkalar (hisobvaraq ifodasi bilan) → subschyotlarni ochib real kodga aylantirish → oy oxiri (QQS zachyoti, valyuta qayta baholash) → hujjatga `auto` belgili provodkalar sifatida yozish. UI hook bank ma’lumoti/sozlama/kurs o‘zgarsa qayta tuzadi. Hisobot dvigateli o‘zgarmaydi.

**Tech Stack:** Vite 6, React 18, TypeScript, Vitest, ExcelJS, idb-keyval, immer.

**Spec:** `docs/superpowers/specs/2026-11-17-avto-provodka-design.md`

## Global Constraints

- Pul — butun tiyin; valyuta summalari — valyutaning kichik birligi (sent) butun son; so‘mga: `Math.round(minor * rate)` tiyin.
- Sanalar ISO `yyyy-mm-dd`.
- Tashqi so‘rov faqat `https://cbu.uz/uz/arkhiv-kursov-valyut/json/{CCY}/{yyyy-mm-dd}/` (faqat valyuta kodi va sana yuboriladi).
- Rejada yo‘q hisobvaraqlar (2970, 8420) ishlatilmaydi.
- Qo‘lda kiritilgan va qo‘lda tuzatilgan (`auto.edited`) provodkalar hech qachon o‘chirilmaydi/o‘zgartirilmaydi.
- Haqiqiy mijoz ma’lumoti faqat `samples/` (git’dan tashqari); git’ga tushadigan testlar — sun’iy nomlar/STIR. Har commit oldidan: `git diff --cached | grep -ciEf samples/leak-patterns.txt` = 0 (naqshlar ro‘yxati git’dan tashqarida).
- UI matni o‘zbek lotin, `t()` orqali (kirill avtomatik).

## Review Focus

1. Bir xil fayl qayta yuklanadi yoki bitta faktura ikkala reyestrda bor → provodka bir marta (Task 1, Task 8 testlari).
2. Avto-provodka qo‘lda tuzatildi yoki o‘chirildi, keyin yangi fayl yuklandi → tuzatish saqlanadi, o‘chirilgani qaytmaydi (Task 9 testi).
3. Internet yo‘q / kurs topilmadi → valyuta operatsiyasi 1:1 kursda emas, umuman provodkasiz va “kurs topilmadi” ogohlantirishi bilan (Task 5 testi).
4. Sotuv soni ombordagidan ko‘p yoki kirimsiz tovar → qisman tannarx + “GTD kerak” ogohlantirishi, NaN yo‘q (Task 6 testi).
5. Hujjatda qo‘lda kiritilgan provodkalar va boshqa yil bor → ular saqlanadi, ogohlantirish chiqadi (Task 8 va Task 9 testlari).

---

### Task 1: soliq.uz CSV reyestrini o‘qish

**Files:**
- Modify: `src/bank/parsers/rows.ts` (`readWorkbookRows`)
- Modify: `src/audit/invoices.ts` (`Invoice`, `parseInvoices`, yangi `normalizeStatus`, `isServiceItem`)
- Modify: `src/ui/bank/bankStore.ts` (`addInvoices`)
- Modify: `src/ui/audit/AuditPage.tsx`, `src/ui/stock/OmborPage.tsx` (fayl kengaytmasi tekshiruvi `.xlsx|.csv`)
- Modify: `src/stock/stock.ts` (o‘z `SERVICE` regex’i o‘rniga `isServiceItem`)
- Test: `src/audit/invoices.test.ts`, `src/bank/parsers/rows.test.ts`

**Interfaces:**
- Produces: `readWorkbookRows(data: ArrayBuffer): Promise<Cell[][][]>` — fayl `PK` bilan boshlanmasa matn: UTF-8 (`fatal: true`), xato bo‘lsa `windows-1251`; ajratgich `;` (birinchi qatorda `;` bo‘lmasa `,`, keyin `\t`); qo‘shtirnoqli maydonlar (`""` → `"`); bitta varaq.
- Produces: `Invoice.brief?: boolean` — tarkibsiz (CSV) faktura: `items: []`, `amount = total`, `vat = 0`.
- Produces: `normalizeStatus(s: string): string` — `Подтверждён`→`Подписан`, `Ожидает подписи партнёра`→`Ожидает`, `Отменено`→`Отменен`, `Отказано`→`Отказ`, boshqalari o‘zgarmaydi; `parseInvoices` har doim shu orqali.
- Produces: `isServiceItem(it: InvoiceItem): boolean` — `/услуг/i` origin yoki birlik `/услуг|xizmat|хизмат|oy\b|месяц|kv\.? ?metr/i`.
- `parseInvoices`: `Номер документ` ustuni bo‘lmasa `СЧЁТ-ФАКТУРА` (yoki `СЧЕТ-ФАКТУРА`) ustunidagi `"<raqam> от dd.mm.yyyy"` dan `docNo`, `date`; `ДОГОВОР` dan `contractNo`, `contractDate`; jami — `СУММА К ОПЛАТЕ`.
- `bankActions.addInvoices`: bir xil `id` bo‘lsa tarkibli (`!brief`) versiya saqlanadi — brief tarkiblini almashtirmaydi.

- [ ] **Step 1: Failing tests** — `rows.test.ts`: `'reads a cp1251 semicolon CSV as one sheet'` (test ichida kichik cp1251 enkoder: А–я → 0xC0–0xFF, Ё 0xA8, ё 0xB8, № 0xB9) → `[['№','ID','СТАТУС'],['1','abc','Подтверждён']]`; qo‘shtirnoq: `'"""ACME"" MCHJ"'` → `'"ACME" MCHJ'`. `invoices.test.ts`: `'parses the soliq.uz CSV registry'` — sarlavha `№;ID;СТАТУС;СЧЁТ-ФАКТУРА;ТИП ЭСФ;ДОГОВОР;ПРОДАВЕЦ (ИНН ИЛИ ПИНФЛ);ПРОДАВЕЦ (НАИМЕНОВАНИЕ);ПРОДАВЕЦ (КОД ФИЛИАЛА);ПРОДАВЕЦ (НАЗВАНИЕ ФИЛИАЛА);ПОКУПАТЕЛЬ (ИНН ИЛИ ПИНФЛ);ПОКУПАТЕЛЬ (НАИМЕНОВАНИЕ);ПОКУПАТЕЛЬ (КОД ФИЛИАЛА);ПОКУПАТЕЛЬ (НАЗВАНИЕ ФИЛИАЛА);СУММА К ОПЛАТЕ;ПРИМЕЧАНИЕ`, qator `1;id1;Подтверждён;20 от 31.10.2026;Стандартный;20 от 09.10.2026;111111111;"""SELLER"" MCHJ";;;222222222;"""BUYER"" MCHJ";;;6400000,0;` → `{ id:'id1', docNo:'20', date:'2026-10-31', status:'Подписан', contractNo:'20', contractDate:'2026-10-09', total:640000000, amount:640000000, vat:0, items:[], brief:true }`. Store testi (`bankStore.test.ts` yangi yoki mavjud): tarkibli, keyin brief yuklansa `items.length > 0` qoladi; brief, keyin tarkibli — tarkibli o‘rnini egallaydi.
- [ ] **Step 2:** `npx vitest run src/audit src/bank/parsers` — FAIL.
- [ ] **Step 3:** Yuqoridagi interfeyslarni amalga oshirish; `stock.ts` `isServiceItem` ni ishlatsin.
- [ ] **Step 4:** `npx vitest run` — hammasi PASS; `npx tsc --noEmit` toza.
- [ ] **Step 5:** Commit `feat: read soliq.uz CSV invoice registries; keep detailed invoice over brief one`.

### Task 2: GTD qiymat va to‘lov ustunlari (+ shablonda)

**Files:**
- Modify: `src/stock/gtd.ts` (`GtdItem`, `parseGtd`)
- Modify: `src/stock/template.ts` (`GTD_TEMPLATE_COLUMNS`)
- Test: `src/stock/gtd.test.ts`, `src/stock/template.test.ts`

**Interfaces:**
- Produces (`GtdItem` ga, ustun bo‘lmasa `null`/`''`): `currency: string` (гр.22, raqamli kod `840` bo‘lsa ham shunday saqlanadi), `rate: number | null` (гр.23), `invoiceValue: number | null` (гр.42, valyuta kichik birligi: `Math.round(v*100)`), `fees: number` (tiyin: 47-1 `Сбор` + `Досмотр`), `duty: number` (tiyin: 47-1 `Пошлина` + `Доп. пошлина` + `Акциз` + `Иные платежи`), `importVat: number` (tiyin: 47-1 `НДС`). Ustunlar “сумма” bo‘yicha topiladi (“ставка” emas): sarlavha `47-1` va to‘lov nomi va `сумма` ni o‘z ichiga oladi.
- Shablonga ixtiyoriy ustunlar (oxiriga, `кол-во` dan keyin): `гр.22 Валюта контракта`, `гр.23 Курс валюты контракта`, `гр.42 Фактурная стоимость товара`, `гр. 47-1 Сбор (10) Сумма`, `гр.47-1 Пошлина (20) Сумма`, `гр. 47-1 НДС (29) Сумма` — izohlari o‘zbekcha.

- [ ] **Step 1: Failing tests** — `gtd.test.ts` `'reads value and customs payment columns'`: sarlavhada yuqoridagi ustunlar, qator `840 | 11973.9 | 13440 | Сбор 1030000 | Пошлина 61246498.5 | НДС 33438217.35` → `{ currency:'840', rate:11973.9, invoiceValue:1344000, fees:103000000, duty:6124649850, importVat:3343821735 }`; ustunsiz eski fayl → `rate:null, invoiceValue:null, fees:0, duty:0, importVat:0`. `template.test.ts`: to‘ldirilgan shablon qatori shu maydonlarni qaytaradi.
- [ ] **Step 2:** FAIL. **Step 3:** amalga oshirish. **Step 4:** `npx vitest run src/stock` PASS.
- [ ] **Step 5:** Commit `feat(gtd): read contract value, rate and customs payments; template gets optional value columns`.

### Task 3: Avto modul turlari, standartlar, hisobvaraq ifodasi

**Files:**
- Create: `src/auto/types.ts`, `src/auto/defaults.ts`, `src/auto/resolve.ts`
- Test: `src/auto/resolve.test.ts`

**Interfaces (Produces):**
```ts
// types.ts
export interface Party { inn: string; name: string }
export interface AccountRef { expr: string; party?: Party; fx?: boolean } // fx: bu tomon valyutada kuzatiladi
export interface AutoDraft { src: string; date: string; text: string; debit: AccountRef; credit: AccountRef; amount: number; fx?: { ccy: string; amount: number }; nonDeductible?: boolean }
export type WarningKind = 'rate-missing'|'no-cost'|'gtd-no-qty'|'gtd-no-value'|'brief-invoice'|'payroll'|'unclassified'|'transit'|'year'|'capital'|'manual-overlap'|'closed-year'|'bad-expr'|'export-gtd';
export interface AutoWarning { kind: WarningKind; text: string; ref?: string; amount?: number }
export interface Gen { drafts: AutoDraft[]; warnings: AutoWarning[]; needRates: Array<{ ccy: string; date: string }> }
export type RateBook = Record<string, number>; // `${CCY}:${yyyy-mm-dd}` → so‘m / 1 birlik
export interface AutoSettings { enabled: boolean; inputHash: string; skip: string[]; accounts: Record<string, string>; types: Record<string, string>; services: Record<string, string>; serviceDefault: string; includePending: boolean; declareCapital: boolean; rates: RateBook }
// resolve.ts
export type ResolvedEntry = Entry & { fx?: { ccy: string; amount: number }; fxDebit?: boolean; fxCredit?: boolean };
export function parseExpr(expr: string): { base: string; kind: 'plain'|'party'|'named'|'sub'; name?: string } | null;
export function resolveDrafts(drafts: AutoDraft[], subs: SubAccount[]): { entries: ResolvedEntry[]; added: SubAccount[]; codeOf: (expr: string) => string | undefined; warnings: AutoWarning[] };
```
- `defaults.ts`: `DEFAULT_AUTO: AutoSettings` (`enabled: true, serviceDefault: '9420', includePending: false, declareCapital: true`, qolganlari bo‘sh); `DEFAULT_TYPE_ACCOUNTS: Record<string, string>` — spec 5.5 jadvali, bank turlari nomi `default-rules.json` va `FALLBACK_CREDIT`/`FALLBACK_DEBIT` dagi aniq satrlar bilan; `PAIRED_TRANSITS = ['5720[Valyuta xaridi]', '5720[Valyuta sotuvi]']`; `INTERNAL_UZS = '5710'`, `INTERNAL_FX = '5720[Valyuta o‘tkazmalari]'`; `FOREIGN_POOL = (ccy) => \`6010[Xorijiy yetkazib beruvchilar (${ccy})]\``.
- Ifoda: `9690` (reja), `6010.*` (kontragent subschyoti — STIR bo‘yicha, STIR bo‘sh yoki `000000000` bo‘lsa nom bo‘yicha; yangi kod `nextSubCode`), `6010[Nom]` (nomli subschyot, mavjudini nom bo‘yicha topadi), `6010.05` (mavjud subschyot). Noto‘g‘ri yoki rejada yo‘q asos → draft tashlab yuboriladi, `bad-expr` ogohlantirishi.
- `ResolvedEntry.id = 'a:' + src`; `auto = { src }`; `nonDeductible` → `tax = { ...suggestTax(entry), nonDeductible: true, manual: true }`.

- [ ] **Step 1: Failing tests** — `'per-party expr opens one subaccount per INN and reuses it'` (ikki draft bir STIR → bitta `6010.01`, nom bilan `{code:'6010.01', parent:'6010', name, stir}`); `'named expr finds an existing subaccount by name'`; `'placeholder INN 000000000 matches by name'`; `'bad expression is skipped with a warning'` (`'99x'`, `'1234'` rejada yo‘q); `'penalty draft gets a non-deductible manual tax tag'`.
- [ ] **Step 2:** FAIL. **Step 3:** amalga oshirish. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(auto): drafts, account expressions and subaccount resolution`.

### Task 4: Valyuta kurslari

**Files:**
- Create: `src/auto/rates.ts`
- Test: `src/auto/rates.test.ts`

**Interfaces (Produces):**
- `ccyAlpha(code: string): string` — `840→USD, 978→EUR, 643→RUB, 156→CNY, 398→KZT, 826→GBP, 392→JPY, 756→CHF`; harfli kod o‘zgarmaydi.
- `rateOn(book: RateBook, ccy: string, date: string): number | null` — `UZS`/`000` → 1; aniq sana, yo‘q bo‘lsa 7 kungacha oldingi eng yaqin sana; aks holda `null`.
- `ratesFromGtd(items: GtdItem[]): RateBook` — `rate` bor qatorlardan `${ccyAlpha(currency)}:${date}`.
- `fetchCbuRates(needs: Array<{ ccy: string; date: string }>, fetchImpl?: typeof fetch): Promise<RateBook>` — har biri uchun URL (Global Constraints), javob `[{ Rate: "11973.90", Nominal: "1" }]` → `Rate/Nominal`; xato bo‘lgan so‘rov tashlab yuboriladi.
- `toTiyin(minor: number, rate: number): number` = `Math.round(minor * rate)`.

- [ ] **Step 1: Failing tests** — `rateOn` aniq / 3 kun oldingi / 9 kun oldingi (`null`) / UZS; `ratesFromGtd` 840 → `USD:2026-07-06 = 11973.9`; `fetchCbuRates` soxta `fetchImpl` bilan URL va natija, 500 javob tashlanadi.
- [ ] **Step 2–4:** FAIL → amalga oshirish → PASS.
- [ ] **Step 5:** Commit `feat(auto): exchange rates from CBU, GTD and manual table`.

### Task 5: Bank operatsiyalari → qoralamalar

**Files:**
- Create: `src/auto/bankEntries.ts`
- Test: `src/auto/bankEntries.test.ts` (sun’iy `Analysis` — kichik yordamchi `testkit` bilan)

**Interfaces:**
- Consumes: `Analysis`, `Operation` (`src/bank/analyze.ts`, `model.ts`), Task 3–4.
- Produces: `defaultAccountExpr(acc: BankAccount, all: BankAccount[]): string` — spec 5.4 (202xx UZS: yagona bo‘lsa `5110`, ko‘p bo‘lsa `5110[UZS <raqam>]`; valyuta → `5210[<CCY> <raqam>]`; boshqa UZS → `5530[<raqam>]`).
- Produces: `bankEntries(a: Analysis, s: AutoSettings, rates: RateBook): Gen`.
- Qoidalar: kirim (`credit>0`) → Dt bank Kt X; chiqim → Dt X Kt bank. Bank tomoni `s.accounts[number] ?? defaultAccountExpr`, valyuta hisobida `fx: true`. X: `o.internal` → `5710` / `INTERNAL_FX` (valyuta, `fx: true`); aks holda `s.types[o.type] ?? DEFAULT_TYPE_ACCOUNTS[o.type]`; topilmasa — kirim: STIR bor `4010.*` / yo‘q `6990[Aniqlanmagan tushumlar]`; chiqim: `6010.*` / `4890[Aniqlanmagan to‘lovlar]` + `unclassified` ogohlantirishi. `party = { inn: korrInn, name: korrName }`. Xorijiy pul (`6010[Xorijiy…(CCY)]`) tomoni `fx: true`.
- Valyuta: summa = `toTiyin(minor, rateOn(...))`, `fx = { ccy, amount: minor }`; kurs yo‘q → draft yo‘q, `rate-missing` + `needRates`.
- `Ustav fondiga hissa (ta'sischidan)` va `s.declareCapital` → qo‘shimcha `Dt 4610.* Kt 8330` (src `bank:<id>:capital`), bitta `capital` ogohlantirishi.
- Penya, Moliyaviy yordam → `nonDeductible: true`.
- Juftlik: har `PAIRED_TRANSITS` uchun shu hisobvaraqqa Dt (so‘m chiqimi) va Kt (valyuta kirimi yoki aksincha) qoralamalari sana bo‘yicha ketma-ket juftlanadi; farq `d = ΣDt − ΣKt` juftlikda: `d>0` → Dt 9430 Kt transit, `d<0` → Dt transit Kt 9390 (src `pair:<ikkinchi op id>`, sana — ikkinchi oyoq sanasi).
- `src = 'bank:' + o.id`; `text = \`${o.type} — ${o.korrName || o.purpose.slice(0, 60)}\``; sana `o.datetime.slice(0, 10)`.

- [ ] **Step 1: Failing tests** — `'customer receipt: Dt 5110 Kt 4010.* with the payer as party'`; `'bank fee goes to 9690'`; `'internal UZS transfer both legs through 5710'`; `'USD payment to foreign supplier converts at the CBU rate and tags fx'` (rate 12000, 150 USD → 180 000 000 tiyin? ya’ni `minor 15000 × 12000 = 180000000`); `'no rate → no draft, rate-missing and needRates'`; `'charter contribution adds 4610/8330 declaration'`; `'SPOT pair difference closes 5720[Valyuta xaridi] to 9430'` (so‘m 1 210 000 000 tiyin, 1000 USD × 12000 → farq 10 000 000 tiyin Dt 9430); `'unclassified outflow without INN → 4890[Aniqlanmagan to‘lovlar] + warning'`.
- [ ] **Step 2–4:** FAIL → amalga oshirish → PASS.
- [ ] **Step 5:** Commit `feat(auto): bank statement operations to draft entries`.

### Task 6: Tannarx (o‘rtacha tortilgan)

**Files:**
- Create: `src/auto/costing.ts`
- Test: `src/auto/costing.test.ts`

**Interfaces:**
- Consumes: `productKey`, `mergeSimilarKeys` (`src/stock/names.ts`), `isServiceItem`, Task 4.
- Produces: `buildCosts(gtd: GtdItem[], invoices: Invoice[], o: { companyInn: string; includePending: boolean; qtyOverrides: Record<string, number>; rates: RateBook }): { cogs: Map<string, { cost: number; missingQty: number; name: string }>; warnings: AutoWarning[] }` — kalit `${invoiceId}:${itemIndex}` (sotuv fakturasi tovar qatori).
- GTD qatori narxi = `toTiyin(invoiceValue, rate ?? rateOn(rates, ccy, date))` + `duty` + GTD bo‘yicha `fees` yig‘indisining shu qator `invoiceValue` ulushi; soni = `qty ?? qtyOverrides[id]`; soni yoki qiymati yo‘q → qatlam yo‘q, `gtd-no-qty`/`gtd-no-value` (GTD bo‘yicha bittadan). ЭК rejimi → e’tiborsiz, `export-gtd`.
- Kirim faktura tovar qatori: narx `amount`, soni `qty`. Holat filtri — `Подписан` (+`Ожидает`).
- Voqealar sana bo‘yicha, bir kunda kirim avval; sotuvda birlik narx = `cost/qty`; mavjuddan ko‘p sotilsa — mavjud qism narxi, qolgani `missingQty`; `qty` 0 ga tushsa `cost = 0`. `missingQty > 0` → tovar bo‘yicha bitta `no-cost` ogohlantirishi (`text` da tovar nomi va jami yetishmagan son, “GTD hisobotini yuklang”).

- [ ] **Step 1: Failing tests** — `'average cost from two receipts'` (10 × 100 000 va 10 × 200 000 tiyin → 5 sotuv = 750 000); `'GTD line cost = value×rate + duty + fee share'`; `'selling more than received → partial cost and no-cost warning'`; `'sale of a product with no receipts → cost 0, missingQty = qty, no NaN'`; `'manual GTD quantity is used when the line has none'`.
- [ ] **Step 2–4:** FAIL → amalga oshirish → PASS.
- [ ] **Step 5:** Commit `feat(auto): weighted-average cost of goods sold from GTD and purchase invoices`.

### Task 7: Fakturalar va GTD → qoralamalar

**Files:**
- Create: `src/auto/invoiceEntries.ts`, `src/auto/gtdEntries.ts`
- Test: `src/auto/invoiceEntries.test.ts`, `src/auto/gtdEntries.test.ts`

**Interfaces:**
- Produces: `invoiceEntries(invoices: Invoice[], o: { companyInn: string; s: AutoSettings; cogs: Map<string, { cost: number }> }): Gen` — spec 5.6. Har faktura uchun ko‘pi bilan: `inv:<id>:goods` (Kt 9020 / Dt 2910), `inv:<id>:services` (Kt 9030 / Dt `s.services[sellerInn] ?? s.serviceDefault`), `inv:<id>:vat` (Kt `6410[QQS]` / Dt `4410[QQS]`), `inv:<id>:cogs` (Dt 9120 Kt 2910, faqat `cost > 0`). Qarshi tomon `4010.*` (xaridor) / `6010.*` (sotuvchi). Matn `Faktura № ${docNo} — ${kontragent}`.
- Brief: sotuv — QQS `Math.round(total*12/112)` (korxonaning tarkibli sotuvlarida QQS bo‘lsa yoki tarkibli sotuv yo‘q bo‘lsa), qolgani tovar; xarid — shu sotuvchining tarkibli fakturalaridagi tovar ulushi va QQS nisbati, bo‘lmasa hammasi xizmat, QQS 0; har biriga `brief-invoice` ogohlantirishi.
- Produces: `gtdEntries(gtd: GtdItem[], rates: RateBook): Gen` — har GTD (ИМ) uchun `gtd:<no>:value` (Dt 2910 Kt `FOREIGN_POOL(ccy)`, `fx`), `gtd:<no>:duty` (fees+duty, Dt 2910 Kt `4410[Bojxona to‘lovlari bo‘naki]`), `gtd:<no>:vat` (Dt `4410[QQS]` Kt `4410[Bojxona to‘lovlari bo‘naki]`); qiymat yo‘q → `gtd-no-value`; kurs yo‘q → `rate-missing` + `needRates`.

- [ ] **Step 1: Failing tests** — `'sale with goods and VAT → 4010.*/9020 and 4010.*/6410[QQS] plus COGS'`; `'purchase of services uses the per-supplier account'`; `'pending invoice ignored unless includePending'`; `'brief sale splits 12/112 VAT and warns'`; `'brief purchase uses the supplier profile'`; `'GTD value, duty and import VAT entries with fx on the foreign pool'`.
- [ ] **Step 2–4:** FAIL → amalga oshirish → PASS.
- [ ] **Step 5:** Commit `feat(auto): invoice and customs declaration entries`.

### Task 8: Oy oxiri va yig‘ish (build)

**Files:**
- Create: `src/auto/monthEnd.ts`, `src/auto/build.ts`, `src/auto/hash.ts`
- Test: `src/auto/build.test.ts`; `samples/auto.acceptance.test.ts` (git’dan tashqari)

**Interfaces:**
- Produces: `monthEndDrafts(entries: ResolvedEntry[], rates: RateBook, codeOf: (expr: string) => string | undefined): Gen` — oyma-oy (birinchi va oxirgi provodka oyi orasida), oy oxiri sanasi bilan: (1) `vat:<yyyy-mm>` Dt `6410[QQS]` Kt `4410[QQS]` = min(4410[QQS] Dt qoldig‘i, 6410[QQS] Kt qoldig‘i), ikkalasi > 0 bo‘lsa; (2) har valyutada kuzatilgan kod (`fxDebit/fxCredit` tomonlari) va valyuta uchun `target = toTiyin(fxQoldiq, rateOn(oy oxiri))`, `d = target − so‘mQoldiq`, `|d| ≥ 100` tiyin → `reval:<code>:<ccy>:<yyyy-mm>`: `d>0` Dt kod Kt 9540, `d<0` Dt 9620 Kt kod (ifoda — kodning o‘zi). Kurs yo‘q → `rate-missing` + `needRates`. Qayta baholash keyingi oy qoldig‘iga qo‘shiladi.
- Produces: `buildAuto(input: AutoInput, subs: SubAccount[]): BuiltAuto` where `AutoInput = { analysis: Analysis | null; invoices: Invoice[]; gtd: GtdItem[]; stockQty: Record<string, number>; rates: RateBook; settings: AutoSettings; companyInn: string; opening: Opening[]; manualEntries: Entry[]; year: number; company: { name: string; inn: string } | null }`, `BuiltAuto = { entries: ResolvedEntry[]; added: SubAccount[]; warnings: AutoWarning[]; needRates: Array<{ ccy: string; date: string }>; company: { name: string; inn: string } | null }`. Tartib: bank + faktura (+ `buildCosts`) + GTD → `resolveDrafts` → `monthEndDrafts` → yana `resolveDrafts` (qo‘shilgan subschyotlar bilan). `declareCapital` — `opening` da 8330 kredit bo‘lsa `false`. Qo‘shimcha ogohlantirishlar: `payroll` (Dt `6410[JShDS]` yoki 6520 bor, 6710 krediti yo‘q — auto va qo‘lda), `transit` (5710/5720 kodlari yakuniy qoldig‘i ≠ 0), `year` (provodkalar `year` dan tashqarida), `manual-overlap` (qo‘lda provodkalarda 5110/5210/4010/6010 bilan shu davrda), `closed-year` (qo‘lda `closing` provodkalar bor). `needRates` — takrorsiz.
- Produces: `autoInputHash(x: unknown): string` — `JSON.stringify` ning FNV-1a xeshi (base36).

- [ ] **Step 1: Failing tests** — `'month-end VAT offset takes the smaller balance'`; `'revaluation posts 9540 gain on a USD account when the rate rises'`; `'build: same invoice once even if passed twice'` (dublikat id → bitta to‘plam); `'payroll warning when JShDS is paid without 6710 accrual'`; `'declareCapital off when opening has 8330'`. Qabul testi (`samples/`): haqiqiy 8 vipiska + 2 reyestr + CSV’lar + GTD bilan `buildAuto` → `5110` yakuniy qoldig‘i `4759084495` tiyin; `buildBalance(...)` da `unmapped` bo‘sh; 400 = 780; `transit` ogohlantirishi bo‘lsa uni chiqarib, natijani konsolga yozish.
- [ ] **Step 2–4:** FAIL → amalga oshirish → PASS (`npx vitest run src/auto samples/auto.acceptance.test.ts`).
- [ ] **Step 5:** Commit `feat(auto): month-end VAT offset and FX revaluation; build pipeline` (samples/ commit’ga kirmaydi).

### Task 9: Hujjat modeli va qo‘llash (apply)

**Files:**
- Modify: `src/engine/types.ts` (`Entry.auto?: { src: string; edited?: boolean }`, `Doc.auto?: AutoSettings`)
- Modify: `src/store/docFile.ts` (`auto` ni `{ ...DEFAULT_AUTO, ...r.auto }` bilan to‘ldirish, yo‘q bo‘lsa `undefined`)
- Create: `src/auto/apply.ts`
- Modify: `src/ui/pages/JournalPage.tsx` (tahrir → `auto.edited = true`; o‘chirish → `src` `doc.auto.skip` ga)
- Test: `src/auto/apply.test.ts`, `src/store/docFile.test.ts` (bor bo‘lsa)

**Interfaces:**
- Produces: `autoSettings(doc: Doc): AutoSettings` (`doc.auto ?? DEFAULT_AUTO`).
- Produces: `applyAuto(d: Doc, built: BuiltAuto, inputHash: string): void` (immer draft ustida): `!auto` va `auto.edited` provodkalar qoladi; qolgan auto o‘chadi; `built.entries` dan `src` `skip` da yoki tahrirlanganlar orasida bo‘lmaganlari qo‘shiladi (`fx*` maydonlarsiz toza `Entry`); `built.added` dan kodi yo‘qlari `d.subaccounts` ga; `d.auto = { ...autoSettings(d), inputHash }`; hujjatda qo‘lda provodka va qoldiq bo‘lmasa — `d.year` = auto provodkalarning eng ko‘p yili, `company.name/stir` bo‘sh bo‘lsa `built.company` dan.
- Produces: `resetAuto(d: Doc): void` — `skip = []`, `auto.edited` provodkalarni o‘chiradi, `inputHash = ''`.

- [ ] **Step 1: Failing tests** — `'apply replaces old auto entries and keeps manual ones'`; `'edited auto entry survives re-apply and its fresh copy is not added'`; `'deleted (skipped) source does not come back'`; `'empty document takes year and company from the data'`; `'reset brings back skipped and edited sources'`; docFile: eski fayl (`auto` yo‘q) o‘qiladi.
- [ ] **Step 2–4:** FAIL → amalga oshirish → PASS; `npx tsc --noEmit` toza.
- [ ] **Step 5:** Commit `feat(auto): auto entries in the document; edits and deletions are kept`.

### Task 10: “Hujjatlardan provodka” sahifasi, sinxronlash va jurnal belgisi

**Files:**
- Create: `src/import/importFiles.ts` (barcha turdagi fayllar: `parseStatements`, `isInvoiceSheet/parseInvoices`, `isGtdSheet/parseGtd` → `bankActions.addStatements/addInvoices/addGtd`; qaytaradi `{ statements: number; invoices: number; gtd: number; errors: Array<{ file: string; error: string }> }`)
- Create: `src/ui/auto/useAutoSync.ts`, `src/ui/auto/AutoPage.tsx`
- Modify: `src/ui/bank/bankStore.ts` (`rates: RateBook` kalit + `addRates(book)`), `src/store/store.ts` (`PageId` ga `'auto'`), `src/ui/components/Shell.tsx` (NAV: Jurnaldan keyin `{ id: 'auto', num: 'H', label: 'Hujjatlardan provodka' }`), `src/App.tsx` (lazy route, `fullWidth`, `useAutoSync()` chaqiruvi), `src/ui/pages/JournalPage.tsx` (“avto” belgisi + manba matni, filtr: Hammasi / Avto / Qo‘lda)

**Interfaces:**
- Consumes: Task 1–9.
- `useAutoSync()`: bank yuklangan va `autoSettings(doc).enabled` bo‘lsa: `analysis = analyze(statements, rulesOf, overrides, settings)`; `rates = { ...ratesFromGtd(gtd), ...bank.rates, ...settings.rates }`; kirish xeshi (statement fayllari, overrides, rules, faktura id+holat, gtd id, stockQty, rates, settings — `inputHash` siz) `doc.auto.inputHash` dan farq qilsa `actions.update(d => applyAuto(d, buildAuto(...), hash))`. `needRates` bo‘lsa va onlayn — `fetchCbuRates` → `bankActions.addRates` (bir xil so‘rov bir marta).
- `AutoPage`: yuklash maydoni (`.xlsx,.csv`, ko‘p fayl) → `importFiles`; yuklangan fayllar ro‘yxati; xulosa (manba turi bo‘yicha: bank / faktura / GTD / tannarx / QQS / qayta baholash / juftlik — soni va summasi jurnaldagi `auto` provodkalardan); “Diqqat” ro‘yxati (`no-cost` yonida “GTD shablonini yuklab olish” tugmasi — `buildGtdTemplate`); sozlamalar: bank hisoblari (`number → ifoda`, standart ko‘rinadi), operatsiya turlari (ma’lumotda bor turlar: soni, summasi, ifoda maydoni; `parseExpr` bilan tekshiruv), xizmat hisobvaraqlari (xizmat sotuvchilar bo‘yicha), `includePending`, `declareCapital`, kurslar jadvali (kerakli `ccy:sana`, qiymat, manba: qo‘lda/MB/GTD; qo‘lda tahrir; “cbu.uz’dan yangilash”); “Avtomatik yangilash” tugmasi; “Avto-provodkalarni tiklash” (`resetAuto`).

- [ ] **Step 1:** `importFiles` uchun test (`src/import/importFiles.test.ts`): sun’iy Format A vipiska + CSV reyestr + GTD shabloni → hisoblagichlar to‘g‘ri, noma’lum fayl `errors` ga.
- [ ] **Step 2–4:** FAIL → amalga oshirish → PASS; `npx tsc --noEmit`; `npm run build`.
- [ ] **Step 5: Brauzerda tekshirish** (`preview_start ochiq-hisob-prod`): haqiqiy fayllarni yuklash → jurnalda avto provodkalar, balansda aktiv = passiv, 2-shakl to‘lgan, avto provodkani tahrirlash/o‘chirish saqlanadi, konsolda xato yo‘q.
- [ ] **Step 6:** Commit `feat: "Hujjatlardan provodka" page, auto sync and journal badges`.

### Task 11: Ombor — tovar nomi filtri va GTD talabi

**Files:**
- Create: `src/ui/stock/ProductFilter.tsx`
- Modify: `src/ui/stock/OmborPage.tsx`, `src/stock/stock.ts` (`needsGtd(row: StockRow): boolean`)
- Test: `src/stock/stock.test.ts`

**Interfaces:**
- Produces: `needsGtd(row: StockRow): boolean` — `row.qtyOut > 0 && (row.opening + row.qtyIn === 0 || row.negative)`.
- `ProductFilter({ options: Array<{ key: string; name: string }>; selected: Set<string> | null; onChange(sel: Set<string> | null) })` — tugma “Tovar nomi ▾ (tanlangan/jami)”, ochiluvchi panel: qidiruv, “Hammasi”, katakchali ro‘yxat; `null` = hammasi. Eski qidiruv qatori o‘rniga.
- OmborPage: jadval va Excel eksport tanlovga bo‘ysunadi; `needsGtd` qatorlar soni > 0 bo‘lsa banner “N ta tovarning kirimi topilmadi — import bo‘lsa GTD hisobotini (shablon) yuklang” + shablon tugmasi; qatorda “GTD kerak” belgisi; `brief` fakturalar soni > 0 bo‘lsa eslatma “N ta faktura tarkibisiz (soliq.uz CSV) — omborga kirmaydi”.

- [ ] **Step 1: Failing test** — `needsGtd`: faqat chiqim → true; kirim > chiqim → false; manfiy → true.
- [ ] **Step 2–4:** FAIL → amalga oshirish → PASS; build.
- [ ] **Step 5: Brauzerda:** filtrdan 2 tovar tanlash → jadvalda 2 qator, Excel eksportda ham; banner va belgilar ko‘rinadi.
- [ ] **Step 6:** Commit `feat(ombor): product name filter, GTD-needed banner and tags`.

### Task 12: Yakuniy tekshiruv va hujjatlar

**Files:**
- Modify: `README.md` (yangi bo‘lim “Hujjatlardan provodka”, Ombor filtri, CSV reyestr)

- [ ] **Step 1:** `npx vitest run` (hammasi), `npx tsc --noEmit`, `npm run build` — toza.
- [ ] **Step 2:** Brauzerda to‘liq oqim: bo‘sh hujjat → 13 ta haqiqiy fayl yuklash → jurnal, balans, 2-shakl, foyda solig‘i, Ombor filtri; skrinshot foydalanuvchiga.
- [ ] **Step 3:** Leak-check va commit `docs: auto entries and Ombor filter in README`.
