# Ochiq Hisob — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free, public, offline-capable web app: the accountant enters journal entries (provodkalar) and the app builds the Uzbek balance sheet (1-shakl), income statement (2-shakl) and profit tax calculation, with cross-checks and Excel export.

**Architecture:** Static single-page app, no server. All accounting logic lives in a pure TypeScript engine (`src/engine`) computed from one JSON document (company, opening balances, entries, subaccounts). UI is React; state is one document store with undo/redo, autosaved to localStorage and saved/opened as a `.ohisob` file.

**Tech Stack:** Vite, React 18, TypeScript, immer, ExcelJS (lazy-loaded), Vitest.

**Spec:** none written — the user skipped the design questions and asked to start. Requirements come from analysing a competitor's demo video (feature level only); name, design and code are our own.

## Global Constraints

- UI language: Uzbek Latin (ʻ for oʻ/gʻ, ’ for tutuq); Cyrillic produced by transliteration, toggle in header.
- Money stored as integer tiyin (1 so'm = 100). Never floats in storage.
- Forms 1 and 2 shown in ming so'm (toggle to so'm); profit tax always in so'm.
- Works fully offline after first load; no data leaves the browser.
- Our own name ("Ochiq Hisob"), palette and layout — do not imitate the reference product's look.
- Profit-tax annex line codes that could not be verified against the official form are labelled as such in the UI.

## Review Focus

1. Account codes typed with subaccount suffix (`6010.05`) or unknown codes — must resolve to parent or show a clear error, never silently drop the amount.
2. Settlement accounts with the "wrong side" balance (supplier 6010 in debit) — must move to the asset line (260), keeping aktiv = passiv.
3. Entries dated outside the selected year — excluded from reports and listed in warnings.
4. Year-end closing entries through 9910 — must not double-count in 2-shakl.
5. Amount input with spaces/commas (`5 000 000,50`) — parsed to exact tiyin.

---

### Task 1: Scaffold
**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`
- [ ] Vite React-TS project, vitest configured (`npm test` → `vitest run`). `npm run build` passes on an empty App.
- [ ] Commit.

### Task 2: Money, periods, transliteration
**Files:** `src/engine/money.ts`, `src/engine/period.ts`, `src/i18n/translit.ts` (+ tests)
**Produces:** `parseAmount(s: string): number|null` (tiyin), `formatAmount(tiyin, unit: 'som'|'ming')`, `periodRange(year, quarter): {from, to}` (cumulative from 01.01), `toCyrillic(latin: string): string`.
- [ ] Tests: `parseAmount('5 000 000,50') === 500000050`; `formatAmount(500000000,'ming') === '5 000'`; `periodRange(2026,1)` → `2026-01-01..2026-03-31`; `toCyrillic("Oʻzgarish yoʻq") === 'Ўзгариш йўқ'`, `toCyrillic('shahar') === 'шаҳар'`, `toCyrillic('Ekspert') === 'Эксперт'`.
- [ ] Implement, pass, commit.

### Task 3: Chart of accounts + ledger
**Files:** `src/engine/accounts.ts` (chart data, BHMS 21), `src/engine/types.ts`, `src/engine/ledger.ts` (+ test)
**Produces:** `findAccount(code): Account|undefined` (accepts `6010.05` → subaccount or parent), `buildLedger(doc, from, to): Map<leafCode, {open, dr, cr, close}>` (signed net = debit − credit, tiyin). Opening at `from` = doc.opening + entries in [yearStart, from).
- [ ] Test: opening 5110 Dt 60M, entry 6010/5110 80M in Jan → 5110 close = −20M net.
- [ ] Implement, pass, commit.

### Task 4: Balance sheet (1-shakl)
**Files:** `src/engine/balanceSheet.ts` (+ test)
**Produces:** `buildBalance(doc, year, quarter): BalanceForm` with `lines: {code,label,start,end,kind}`, `contrib` per line.
Mapping by account range: debit-balance line / credit-balance line (e.g. 6000–6099 → 260 / 610, 4000–4099 → 220 / 670, 9000–9999 → 450). Totals by formula (012=010−011 … 400=130+390; 480=410+420+430−440+450+460+470; 780=480+770).
- [ ] Test with opening {0130 Dt 50M, 0230 Kt 10M, 2910 Dt 150M, 5110 Dt 60M, 6010 Kt 40M, 8330 Kt 100M, 8720 Kt 110M}: start 400 = 780 = 250 000 000 so'm; 012 = 40M; 180 = 150M.
- [ ] Test: supplier paid more than owed (6010 net debit) lands in 260 and 400 = 780.
- [ ] Implement, pass, commit.

### Task 5: Income statement (2-shakl)
**Files:** `src/engine/incomeStatement.ts` (+ test)
**Produces:** `buildIncome(doc, year, quarter): IncomeForm` — lines 010…270, current from P&L turnovers excluding entries touching 99xx; prior year from `doc.prevYear`.
- [ ] Test: sales 180M (Kt 9020), cost 120M (Dt 9120), admin 30M (Dt 9420), tax 4.5M (Dt 9810) → 030 = 60M, 270 = 25.5M; adding closing entries via 9910 leaves 270 unchanged.
- [ ] Implement, pass, commit.

### Task 6: Profit tax, auto tagging, checks, closing
**Files:** `src/engine/taxSuggest.ts`, `src/engine/profitTax.ts`, `src/engine/checks.ts`, `src/engine/closing.ts`, `src/engine/trialBalance.ts`, `src/engine/reconciliation.ts` (+ tests)
- [ ] `suggestTax(entry)`: Kt 9010/9020/9030 → income 021/022/023; Dt 9100 → exp 020; 9410 → 030; 9420 → 040; 96xx → 050; 9430/9720 → 060; keywords "jarima|penya|xayriya" → nonDeductible; 9810/9820/99xx/non-P&L → null.
- [ ] `buildProfitTax`: main lines 010–150 (rate 15%, 060 = max(0, 030−040−050), 080 = 062×rate), annex 1 and annex 2 (col 3 total, col 4 non-deductible). Test: income 220M, expenses 173.2M → 030 = 46.8M, 080 = 7 020 000.
- [ ] `runChecks`: opening Dt=Kt; 400=780 start/end; 270 → 450 roll-forward; tax 150 = 2-shakl 250 with fix entry Dt 9810 Kt 6410; 2-shakl 010 = annex 1 020. Warnings: out-of-year entries, unknown accounts, unclosed P&L at year end, non-deductible total.
- [ ] `makeClosingEntries(doc)` and `rollToNextYear(doc)`; test that next-year opening balances sum Dt = Kt and 9xxx are zero.
- [ ] Commit.

### Task 7: Store, persistence, app shell
**Files:** `src/store/store.ts`, `src/store/persist.ts`, `src/App.tsx`, `src/ui/components/*`, `src/styles.css`
- [ ] Store: `useDoc()`, `update(fn)` (immer, pushes undo), `undo/redo` (Ctrl+Z / Ctrl+Y), ui state (page, year, quarter, unit, script). Autosave to localStorage; dirty flag vs last file save; `.ohisob` save/open.
- [ ] Shell: header (brand, period, unit, script, undo/redo, Yangi/Ochish/Saqlash, Excel buttons), left navigation, right checks panel with key figures and warnings.

### Task 8: Data-entry pages
**Files:** `src/ui/pages/OpeningPage.tsx`, `JournalPage.tsx`, `SubaccountsPage.tsx`, `SettingsPage.tsx`
- [ ] Journal: entry form with live account hint and report-line hint, Enter adds, edit/delete rows, search, per-row tax select + "chegirilmaydi", recurring templates, sample data, clear.
- [ ] Opening balances with totals check; subaccounts with STIR, group filters, merge by STIR, reconciliation act modal.

### Task 9: Report pages + Excel
**Files:** `src/ui/pages/BalancePage.tsx`, `IncomePage.tsx`, `TaxPage.tsx`, `TrialBalancePage.tsx`, `src/excel/*`
- [ ] Report tables with drill-down to source entries; Excel: each form, "3 rasmiy shakl", all reports workbook, reconciliation act; import journal/opening from xlsx.

### Task 10: Verify and ship
- [ ] `npm test`, `npm run build`, click through in browser (sample data → all checks green), offline service worker, README with deploy steps.
