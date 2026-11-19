# Reja (1C), rasmiy shakllar va korxonalar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hisobvaraqlar rejasi 1C ro‘yxatiga (758 kod, o‘zbekcha nomlar) o‘tadi; balans, 2-shakl, foyda solig‘i va ularning ilovalari shablon tuzilishida (lotin + kirill tugmasi) chiqadi; bir nechta korxona qo‘shiladi.

**Architecture:** Reja — generatsiya qilingan `CHART_SOURCE`. Shakllar — ma’lumot sifatidagi ta’riflar (`src/forms/defs.ts`, shablondan skript bilan olingan) + qiymat manbalari (avtomat hisob yoki qo‘lda `doc.forms`) + bitta `FormView` va bitta Excel yozuvchi. Korxonalar — ro‘yxat + har korxonaga alohida hujjat kaliti va IndexedDB bazasi (birinchi korxona eski kalitlardan foydalanadi, ko‘chirish yo‘q).

**Tech Stack:** Vite 6, React 18, TypeScript, Vitest, ExcelJS, idb-keyval, immer; dev-skriptlar Python 3 + openpyxl.

**Spec:** `docs/superpowers/specs/2026-11-19-reja-shakllar-korxonalar-design.md`

## Global Constraints

- Hisobvaraq nomlari o‘zbek lotin (tarjima); ruscha asl nom `nameRu` da; shakl matnlari lotin, kirill — mavjud `toCyrillic` orqali.
- Shablonlar (`samples/ref/*.xlsx|xltx`) git’ga tushmaydi; generatsiya qilingan fayllarda mijoz ma’lumoti yo‘q. Har commit oldidan: `git diff --cached | grep -ciEf samples/leak-patterns.txt` = 0.
- Pul — tiyin; shakllar ekranda va Excel’da “ming so‘m” (mavjud yaxlitlash qoidalari bilan).
- Mavjud provodkalar o‘chmaydi va o‘zgarmaydi; rejada yo‘q kod — ogohlantirish, hisobotda 4 xonali asos bo‘yicha.
- Saytga chiqarish faqat foydalanuvchi so‘rasa.

## Review Focus

1. Eski hujjatda yangi rejada yo‘q yoki ma’nosi o‘zgargan kod (`5720`, `6410`) → provodka saqlanadi, jurnalda “rejada yo‘q” belgisi, balans/2-shakl o‘zgarmaydi (Task 2 testi).
2. Saqlanmagan o‘zgarish bilan korxona almashtirish → hech narsa yo‘qolmaydi (Task 11 testi).
3. Avvalgi versiyadagi yagona korxona ma’lumoti (localStorage hujjat + `ochiq-hisob-bank`) → birinchi korxona bo‘lib, ko‘chirmasdan ochiladi (Task 11 testi).
4. Qo‘lda kiritilgan shakl qiymati boshqa chorak yoki korxonaga o‘tib ketmaydi (Task 7 testi).
5. Kirill tugmasi yangi lotin matnlarda (oʻ, gʻ, ’) to‘g‘ri ishlaydi (Task 6 testi).

---

## Bosqich A — Hisobvaraqlar rejasi

### Task 1: Reja manbasini generatsiya qilish va tarjima

**Files:**
- Create: `scripts/gen_chart.py` (o‘qiydi `samples/ref/chart.xlsx`, yozadi `scripts/chart-draft.tsv`: `code	kind	cur	ru	uz` — `uz` eski `CHART_SOURCE` dan mos kod bo‘lsa)
- Create: `scripts/chart-uz.tsv` (to‘liq tarjima: `code	uz`, 758 qator — qo‘lda)
- Create: `scripts/build_chart.py` (draft + tarjima → `src/engine/chart.ts` `CHART_SOURCE` qatorlari `code|kind|cur|uz|ru`)
- Modify: `src/engine/chart.ts`
- Test: `src/engine/chart.test.ts`, `samples/chart.acceptance.test.ts` (git’dan tashqari: Excel’dagi har kod rejada bor)

**Interfaces (Produces):** `CHART_SOURCE` qator formati `code|kind|cur|uz|ru`, kind ∈ `A|P|T|KA|Z|` (bo‘sh = noma’lum), cur `+` yoki bo‘sh.

- [ ] **Step 1:** `gen_chart.py` — draft TSV (758 qator) va eski nomlar bilan to‘ldirish.
- [ ] **Step 2:** `chart-uz.tsv` — qolgan nomlarni o‘zbek lotinga tarjima (BHMS 21 atamalari; “(в валюте)” → “(valyutada)”, “(в у.е.)” → “(shartli birlikda)”, “по деятельности с основной системой налогообложения” → “umumbelgilangan soliq tizimidagi faoliyat bo‘yicha”, “… с особой системой …” → “maxsus soliq tizimidagi faoliyat bo‘yicha”).
- [ ] **Step 3: Failing tests** `chart.test.ts`: `'chart has the 1C accounts with kinds and currency flags'` — `CHART.length === 758`; `findAccount('4410.3')` → `{ kind: 'A', name: /QQS/ }`; `findAccount('6015').currency === true`; `findAccount('003.10').offBalance === true`; `'no Cyrillic letters in Uzbek names'` — `CHART.every(a => !/[а-яё]/i.test(a.name))`; `'Russian name kept'` — `findAccount('6010').nameRu === 'Расчеты с поставщиками и подрядчиками'`. Qabul testi (samples): Excel’dagi kodlar to‘plami = `CHART` kodlari.
- [ ] **Step 4:** `build_chart.py` → `chart.ts`; `npx vitest run src/engine` (Task 2 dan oldin `accounts.ts` eski formatni o‘qiydi — shu task’da `Account` parsing’ni yangi 5 maydonga moslash). PASS.
- [ ] **Step 5:** Commit `feat(chart): 1C chart of accounts with Uzbek names`.

### Task 2: Hisobvaraq API va eski hujjatlar

**Files:**
- Modify: `src/engine/accounts.ts`, `src/engine/subaccounts.ts`, `src/engine/balanceSheet.ts` (`isOffBalance`)
- Modify: `src/ui/pages/JournalPage.tsx` (rejada yo‘q kod belgisi), `src/ui/components/common.tsx` (`AccountDatalist`, `AccountLabel` — ruscha nom bilan qidiruv)
- Test: `src/engine/accounts.test.ts`

**Interfaces (Produces):**
```ts
export interface Account { code: string; name: string; nameRu: string; kind: 'A'|'P'|'T'|'KA'|'Z'|''; currency: boolean; parent?: string; group: boolean; offBalance: boolean }
export function findAccount(code: string, subs?: SubAccount[]): Account | undefined; // avval reja (nuqtali ham), keyin subschyot, keyin asosiy nom
export function isKnownAccount(code: string, subs: SubAccount[]): boolean;          // reja (guruh emas) yoki subschyot
export function searchAccounts(q: string, subs: SubAccount[], limit?: number): Account[]; // kod boshi, o‘zbekcha yoki ruscha nom bo‘yicha
export function synthetic(code: string): string; // birinchi nuqtagacha
export function isOffBalance(code: string): boolean; // kind Z, 3 xonali yoki raqamsiz
```
- `group` = 4 xonali `XX00`; `parent` = nuqtali kodda oxirgi nuqtagacha, aks holda guruh kodi.
- `nextSubCode` rejadagi kod bilan to‘qnashadigan raqamni o‘tkazib yuboradi.

- [ ] **Step 1: Failing tests** — `'dotted chart codes are chart accounts, not subaccounts'` (`findAccount('6410.1').parent === '6410'`); `'a counterparty subaccount never takes a chart code'` (`nextSubCode('004', 'X', '', [])` ≠ `'004.01'` chunki rejada bor); `'old document codes missing in the new chart stay usable'` — `isKnownAccount('5720.01', [{code:'5720.01',parent:'5720',name:'X'}])` true va `balanceLineFor('5720.01', 100) === '360'`; `'search finds by Russian name'` — `searchAccounts('поставщик', [])[0].code === '6000'` yoki `'6010'`.
- [ ] **Step 2–4:** FAIL → amalga oshirish → `npx vitest run src` PASS (mavjud testlardagi eski kodlar ham ishlaydi).
- [ ] **Step 5:** Jurnalda `!isKnownAccount` kodga `tag warn` “rejada yo‘q”; commit `feat(chart): account lookup, search and old codes`.

### Task 3: Hisobot bog‘lanishlari va namuna ma’lumot

**Files:**
- Modify: `src/engine/incomeStatement.ts` (`incomeLineFor` aniq ro‘yxat), `src/engine/taxSuggest.ts`, `src/engine/checks.ts` (Kt 6410 → 6430), `src/engine/sample.ts`, `src/engine/testDoc.ts`
- Test: `src/engine/incomeStatement.test.ts`, `src/engine/sample.test.ts`

**Interfaces:** `incomeLineFor(code)`: 010←9000–9099; 020←9100–9199; 050←9410; 060←9420; 070←9430–9439; 080←9440–9499; 090←9300–9399; 120←9520; 130←9530; 140←9550; 150←9540–9541; 160←boshqa 9500–9599; 180←9610; 190←9650; 200←9620–9621; 210←boshqa 9600–9699; 230←9700–9799; 250←9810; 260←9820–9899. Foyda solig‘i taklifi xuddi shu diapazonlarga (`i130` kurs farqi daromadi 9540–9541, `e…` 0114 kurs zarari 9620–9621).

- [ ] **Step 1: Failing tests** — `'2-shakl lines follow the chart'`: `['9520','120'],['9530','130'],['9550','140'],['9541','150'],['9510','160'],['9650','190'],['9621','200'],['9431.4','070'],['9020.1','010'],['9120.1','020']` ; `'sample uses only accounts known to the new chart'` — har provodka/qoldiq kodi `isKnownAccount(code, sample.subaccounts)`; `'profit tax check books to 6430'`.
- [ ] **Step 2–4:** FAIL → amalga oshirish (namuna: 6410 → 6410.1, 6520 → 6510.1 va h.k.) → PASS.
- [ ] **Step 5:** Commit `fix(reports): 2-shakl and tax lines follow the 1C chart; sample on new codes`.

### Task 4: Avto-provodkalar yangi rejada

**Files:**
- Modify: `src/auto/defaults.ts`, `src/auto/bankEntries.ts`, `src/auto/invoiceEntries.ts`, `src/auto/gtdEntries.ts`, `src/auto/monthEnd.ts`, `src/auto/build.ts` (payroll), testlar `src/auto/*.test.ts` (kutilgan kodlar)

**Interfaces:** `VAT_IN_GOODS='4410.3'`, `VAT_IN_SERVICES='4410.4'`, `VAT_IN_IMPORT='4410.5'`, `VAT_INPUTS=[…uchalasi]`, `VAT_OUT='6410.1'`, `CUSTOMS_ADVANCE='4490'`, `RETAIL='4090'`, `INTERNAL_FX='5715'`, `SPOT_BUY='5730'`, `SPOT_SELL='5740'`, `FOREIGN_POOL=(c)=>\`6015[Xorijiy yetkazib beruvchilar (${c})]\``, sotuv `9020.1`/`9030.1`, tannarx `9120.1`; soliqlar: JShDS `6420.1`, INPS `6530.1`, ijtimoiy `6510.1`, aylanma/foyda `6430`, mol-mulk `6450`, yer `6460`, boshqa `6490`. Xarid QQS: tovar qatori → 4410.3, xizmat → 4410.4 (alohida `inv:<id>:vat` va `inv:<id>:vat-s`). Oy oxiri: har kirim QQS hisobvarag‘i uchun `vat:<ym>:<code>`, chiqim QQS qoldig‘i tugaguncha.

- [ ] **Step 1:** Testlardagi kutilgan kodlarni yangilash (RED): masalan `'purchase of services'` → QQS `4410.4`; `'GTD … import VAT'` → `4410.5`, bojxona `4490`; `'month-end VAT offset'` ikki kirim hisobvarag‘i bilan.
- [ ] **Step 2–4:** FAIL → amalga oshirish → `npx vitest run src/auto` va qabul testi (samples) PASS, balans teng.
- [ ] **Step 5:** Commit `feat(auto): auto entries on the 1C chart accounts`.

### Task 5: “Hisobvaraqlar rejasi” sahifasi

**Files:** Create `src/ui/pages/ChartPage.tsx`; Modify `src/store/store.ts` (PageId `'chart'`), `src/ui/components/Shell.tsx` (NAV “Hisobvaraqlar rejasi”), `src/App.tsx`.
- Qidiruv (`searchAccounts`), guruhlar bo‘yicha jadval: kod, nom (o‘zbekcha), ruscha nom (kichik), tur, valyuta belgisi; subschyotlar (kontragentlar) shu jadvalda ota hisobvaraq ostida.
- [ ] **Step 1:** Brauzerda: “4410” qidiruvida 4410.1–4410.10 chiqadi; kirill tugmasi nomlarni o‘giradi. Build toza. Commit `feat(chart): chart of accounts page`.

## Bosqich B — Rasmiy shakllar

### Task 6: Shakl ta’riflarini shablondan olish

**Files:**
- Create: `scripts/extract_forms.py` (o‘qiydi `samples/ref/balans.xltx`, `moliyaviy.xltx`, `foyda.xltx`; kirill→lotin transliteratsiya ichida; yozadi `src/forms/defs.generated.ts`)
- Create: `src/forms/types.ts`, `src/forms/defs.ts` (generatsiyani + qo‘lda formulalar/manbalar ustiga qo‘yish)
- Test: `src/forms/defs.test.ts`

**Interfaces (Produces):**
```ts
export interface ColumnDef { id: string; label: string; num: string }        // num — ustun raqami qatori ("3")
export interface LineDef { code?: string; label: string; kind: 'section'|'header'|'line'|'total'|'note'; formula?: Array<[1|-1, string]>; cells?: Record<string, 'x'|'input'|'auto'> }
export interface FormDef { id: FormId; group: 'balance'|'income'|'tax'; title: string; columns: ColumnDef[]; lines: LineDef[]; header: 'company'|'short'; rows?: { sections: Array<{ code: string; label: string }> } } // rows — nomli qatorlar (muddati o‘tgan qarzlar)
export type FormId = 'b1'|'b1-offbal'|'b1-overdue'|'f2'|'f2-budget'|'tax'|'tax-1'|'tax-2'|'tax-2.1'|'tax-2.1a'|'tax-2.1b'|'tax-3'|'tax-4'|'tax-5'|'tax-6'|'tax-7'|'tax-8'|'tax-9'|'tax-10'|'tax-11';
export const FORMS: Record<FormId, FormDef>;
```
- Transliteratsiya: ш→sh, ч→ch, ў→oʻ, ғ→gʻ, қ→q, ҳ→h, ё→yo, ю→yu, я→ya, ц→s/ts, е→e (so‘z boshida ye), ъ→’, ь→’ ; katta harflar saqlanadi.
- Imzo qatorlari (Rahbar, Bosh buxgalter), sarlavha blokidagi qiymatlar va ism-familiyalar olinmaydi.
- Formulalar: satr nomidagi “(satr. A+B-C)”, “(A-satr — B-satr)”, “A–B-satrlar yig‘indisi” dan; qolganlari `defs.ts` dagi qo‘lda jadval.

- [ ] **Step 1: Failing tests** — `'balance form has the official line codes'` (`FORMS.b1` kodlari = `BALANCE_LINES` kodlari); `'2-shakl codes 010–270'`; `'tax main has 010…150 incl. 061, 062, 063, 071, 072'`; `'annex 1 has 010…288'`, `'annex 2 has 0101…0137 and 01371…01378'`; `'off-balance 790…920'`; `'budget payments 280…480'`; `'labels are Latin'` (hech bir yorliqda kirill harf yo‘q); `'no client data'` (yorliqlarda `samples/leak-patterns.txt` naqshlari yo‘q — test fayl ichida sun’iy ro‘yxat bilan: STIR ko‘rinishidagi 9 xonali raqam yo‘q); `'annex totals have formulas'` (`FORMS['tax-1']` 010 formulasi 020 va 050–280 ni o‘z ichiga oladi).
- [ ] **Step 2–4:** FAIL → skript + ta’riflar → PASS. `toCyrillic` bilan 3 yorliq namunasi to‘g‘ri o‘giriladi (Review Focus 5).
- [ ] **Step 5:** Commit `feat(forms): official form definitions from the templates`.

### Task 7: Qo‘lda qiymatlar va formulalar

**Files:** Create `src/forms/values.ts`; Modify `src/engine/types.ts` (`Doc.forms?: Record<string, Record<string, Record<string, number>>>`, `Company` ga sarlavha maydonlari: `industry, legalForm, ownership, ministry, region, codes: { ktut, ifut, txsht, msht, dbibt, mxobt }`), `src/store/docFile.ts`.
**Interfaces (Produces):**
```ts
export type Cell = { v: number | null; auto: boolean; overridden?: boolean };
export function formKey(id: FormId, quarter: Quarter): string;                // "tax-2:4"
export function manualValues(doc: Doc, id: FormId, quarter: Quarter): Record<string, Record<string, number>>;
export function setFormValue(d: Doc, id: FormId, quarter: Quarter, line: string, col: string, v: number | null): void;
export function evaluate(def: FormDef, auto: Record<string, Record<string, number>>, manual: Record<string, Record<string, number>>): Record<string, Record<string, Cell>>; // qo‘lda > avtomat; jami — formula bo‘yicha
```
- [ ] **Step 1: Failing tests** — `'manual value wins over auto and is marked overridden'`; `'totals follow formulas'`; `'a value for Q2 does not show in Q3'` (Review Focus 4); `'old files without forms open'`.
- [ ] **Step 2–5:** FAIL → PASS → commit `feat(forms): manual values and totals`.

### Task 8: Avtomatik manbalar

**Files:** Create `src/forms/sources.ts`; Test `src/forms/sources.test.ts`.
**Interfaces (Produces):** `autoValues(id: FormId, doc: Doc, quarter: Quarter, report: Report): Record<string, Record<string, number>>` (tiyin; ustun id’lari ta’rifdagi bilan).
- `b1`, `f2`, `tax` — mavjud `report.balance`, `report.income`, `report.tax` dan.
- `b1-offbal`: 790←001 … 920←014 (davr boshi/oxiri qoldig‘i, 3 xonali asos bo‘yicha).
- `f2-budget`: hisoblangan = soliq hisobvarag‘ining davrdagi krediti, to‘langan = debeti (krediti 5xxx bo‘lgan provodkalar); 280←6430, 290←6420, 291←6530.1, 310←6410, 320←6440, 350←6450, 360←6460, 400←6490, 440←6510+6520, 450←Kt 4490 (Dt 2910 bilan) / Dt 4490 (Kt 5xxx), 470←matnida penya/jarima/пеня/штраф bo‘lgan 9430 provodkalari; 480 = 280…470 (291 siz).
- `tax-1`: 020/021 ← sotuv tushumi (9000–9099), 130 ← 9540–9541, 280 ← qolgan daromadlar.
- `tax-2`: 020 ← 9100–9199; 030 ← qolgan chegiriladigan xarajatlar; ustun 4 ← chegirilmaydigan belgili; 0105 ← Kt 6710/6510/6520 bilan xarajat, 0106 ← Kt 02xx/05xx, 0107 ← 9120, 0111 ← 9431.4 yoki matnda ijara/аренд, 0113 ← 9610, 0114 ← 9620–9621, 0129 ← chegirilmaydigan penya/jarima, 0137 ← qolgani.
- [ ] **Step 1: Failing tests** — har manba uchun bitta: `'off-balance line 820 from account 004'`, `'budget payments: accrued vs paid for JShDS'`, `'annex 2 splits expenses into 0105, 0113, 0137'`, `'annex 1 puts FX gains in 130'`.
- [ ] **Step 2–5:** FAIL → PASS → commit `feat(forms): automatic values for annexes`.

### Task 9: `FormView` va sahifalar

**Files:** Create `src/ui/forms/FormView.tsx`, `src/ui/forms/FormPage.tsx`; Modify `src/ui/pages/ReportPages.tsx` (Balance/Income/Tax sahifalari `FormPage` ga), `src/ui/pages/OtherPages.tsx` (Sozlamalar: korxona sarlavha maydonlari), `src/styles.css`.
- soliq.uz uslubi: sarlavha bloki (korxona kartochkasidan, bo‘sh bo‘lishi mumkin), “O‘lchov birligi, ming so‘m”, ustun raqamlari qatori, `x` kataklar, qo‘lda kataklar (`AmountInput`, o‘zgartirilgan avtomat — belgi va “↺ avtomat”), satrni bosganda mavjud drill-down; tepada shakl/ilova tanlovi (soliq.uz dagi kabi ro‘yxat); muddati o‘tgan qarzlarda “+ qator” va nom kiritish.
- [ ] **Step 1:** Brauzerda (namuna ma’lumot): balans 400 = 780 avvalgidek; balansdan tashqari ilova ochiladi; 2-shakl byudjet ilovasida 290 to‘ldirilgan; foyda solig‘i 2-ilovada 0101–0137, 3–11-ilovalar tahrirlanadi va saqlanadi; kirill tugmasi; konsol toza. Build toza.
- [ ] **Step 2:** Commit `feat(forms): official-looking form pages with annexes`.

### Task 10: Excel eksport shakllar bo‘yicha

**Files:** Create `src/excel/formWorkbook.ts`; Modify `src/excel/workbooks.ts`, `src/excel/exportForms.ts`; Test `src/excel/excel.test.ts`.
**Interfaces:** `buildFormsWorkbook(group: 'balance'|'income'|'tax', doc, quarter, report, tr): Promise<ExcelJS.Workbook>` — guruhdagi har shakl/ilova alohida varaq: sarlavha bloki, jadval (kod, nom, ustunlar), ming so‘m.
- [ ] **Step 1: Failing test** — `'tax workbook has the main form and 14 annex sheets with codes'`; `'balance workbook has 3 sheets and 400 = 780'`.
- [ ] **Step 2–5:** FAIL → PASS → commit `feat(excel): export forms and annexes in the official layout`.

## Bosqich C — Korxonalar

### Task 11: Korxonalar ro‘yxati va xotira

**Files:** Create `src/store/companies.ts`; Modify `src/store/store.ts` (hujjat kaliti joriy korxonadan; `actions.switchCompany`, `addCompany`, `renameCompany`, `removeCompany`), `src/ui/bank/bankStore.ts` (`useBankDb(name)`: holatni tozalab, boshqa bazadan yuklash).
**Interfaces (Produces):**
```ts
export interface CompanyRef { id: string; name: string; stir: string; docKey: string; bankDb: string }
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export function loadCompanies(kv: KV): { list: CompanyRef[]; currentId: string }; // ro‘yxat yo‘q bo‘lsa: eski 'ochiq-hisob:doc' + 'ochiq-hisob-bank' bilan birinchi korxona
export function addCompanyTo(kv: KV, name: string, stir: string): CompanyRef;     // docKey `ochiq-hisob:doc:<id>`, bankDb `ochiq-hisob-bank-<id>`
export function removeCompanyFrom(kv: KV, id: string): void;                      // oxirgisini o‘chirib bo‘lmaydi
```
- [ ] **Step 1: Failing tests** (`src/store/companies.test.ts`, xotiradagi `KV` bilan) — `'legacy single-company data becomes the first company without copying'` (Review Focus 3); `'a new company gets its own document and bank keys'`; `'the last company cannot be removed'`; `'switching saves the current document first'` (store darajasida: `switchCompany` oldidan joriy hujjat `docKey` ga yoziladi — Review Focus 2).
- [ ] **Step 2–5:** FAIL → PASS → commit `feat: several companies with separate documents and uploads`.

### Task 12: Korxona tanlagich va fayl ochish

**Files:** Create `src/ui/components/CompanySwitcher.tsx`; Modify `src/ui/components/Shell.tsx`, `src/App.tsx` / `src/store/fileIO.ts` (`.ohisob` ochilganda STIR bo‘yicha korxona tanlash yoki yangi korxona).
- Yon panel tepasida: joriy korxona nomi ▾ → ro‘yxat, “+ Korxona qo‘shish” (nom, STIR), “Nomini o‘zgartirish”, “O‘chirish” (tasdiq: hujjat va yuklangan fayllar o‘chadi).
- [ ] **Step 1:** Brauzerda: 2-korxona qo‘shish → bo‘sh jurnal; 1-korxonaga qaytish → avvalgi provodkalar va yuklangan fayllar joyida; o‘chirish tasdiq bilan. Commit `feat: company switcher`.

### Task 13: Yakuniy tekshiruv

- [ ] **Step 1:** `npx vitest run`, `npx tsc --noEmit`, `npm run build` toza; haqiqiy fayllar bilan qabul testi: balans teng, 5110 = bank.
- [ ] **Step 2:** Brauzerda to‘liq oqim (yangi korxona → 13 faylni yuklash → jurnal → balans va ilovalar → 2-shakl va ilova → foyda solig‘i va ilovalar → Excel eksport), skrinshot.
- [ ] **Step 3:** README yangilash; leak-check; commit `docs: chart, forms and companies in README`.
