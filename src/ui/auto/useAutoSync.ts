import { useEffect, useMemo } from 'react';
import { companyInnOf } from '../../audit/invoices';
import { applyAuto, autoSettings } from '../../auto/apply';
import { buildAuto, type AutoInput, type BuiltAuto } from '../../auto/build';
import { autoInputHash } from '../../auto/hash';
import { fetchCbuRates, ratesFromGtd } from '../../auto/rates';
import type { RateNeed } from '../../auto/types';
import { analyze, type Analysis } from '../../bank/analyze';
import { synthetic } from '../../engine/accounts';
import type { Doc } from '../../engine/types';
import { actions, getState, useApp } from '../../store/store';
import { bankActions, loadBank, rulesOf, useBank, type BankState } from '../bank/bankStore';

const analysisOf = (bank: BankState): Analysis | null =>
  bank.statements.length ? analyze(bank.statements, rulesOf(bank), bank.overrides, bank.settings) : null;

/** Everything the auto entries are built from, and a fingerprint that changes when any of it does. */
export function autoInputOf(bank: BankState, doc: Doc, analysis: Analysis | null): { input: AutoInput; hash: string } {
  const s = autoSettings(doc);
  const rates = { ...ratesFromGtd(bank.gtd), ...bank.rates, ...s.rates };
  const input: AutoInput = {
    analysis,
    invoices: bank.invoices,
    gtd: bank.gtd,
    stockQty: bank.stockQty,
    rates,
    settings: s,
    companyInn: analysis?.company.inn || companyInnOf(bank.invoices) || doc.company.stir,
    opening: doc.opening,
    manualEntries: doc.entries.filter((e) => !e.auto),
    year: doc.year,
    company: analysis ? { name: analysis.company.name, inn: analysis.company.inn } : null,
  };
  const hash = autoInputHash({
    st: bank.statements.map((x) => [x.file, x.account.number, x.operations.length]),
    ov: bank.overrides,
    rules: bank.rules,
    bs: bank.settings,
    inv: bank.invoices.map((i) => [i.id, i.status, i.brief ? 1 : 0, i.total, i.items.length]),
    gtd: bank.gtd.map((g) => [g.id, g.qty, g.invoiceValue, g.rate]),
    q: bank.stockQty,
    rates,
    s: { ...s, inputHash: '', enabled: true },
    cap: doc.opening.some((o) => synthetic(o.account) === '8330' && o.credit > 0),
  });
  return { input, hash };
}

/** Input, fingerprint and a fresh build for the current data (used by the page to show warnings). */
export function useAutoBuild(): { input: AutoInput; hash: string; built: BuiltAuto; analysis: Analysis | null } {
  const bank = useBank();
  const { h } = useApp();
  const doc = h.doc;
  const analysis = useMemo(() => analysisOf(bank), [bank.statements, bank.rules, bank.overrides, bank.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const { input, hash } = useMemo(() => autoInputOf(bank, doc, analysis), [bank, doc, analysis]);
  const built = useMemo(() => buildAuto(input, doc.subaccounts), [input, doc.subaccounts]);
  return { input, hash, built, analysis };
}

const attempted = new Set<string>();

/** Asks cbu.uz once for each missing rate; the answers go to the rate cache and trigger a rebuild. */
export async function fetchMissingRates(needs: RateNeed[], force = false): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  const fresh = needs.filter((n) => force || !attempted.has(`${n.ccy}:${n.date}`));
  fresh.forEach((n) => attempted.add(`${n.ccy}:${n.date}`));
  if (!fresh.length) return 0;
  const book = await fetchCbuRates(fresh);
  if (Object.keys(book).length) bankActions.addRates(book);
  return Object.keys(book).length;
}

/** Keeps the journal's auto entries in step with the uploaded documents. Mounted once in the app. */
export function useAutoSync(): void {
  const bank = useBank();
  const { h } = useApp();
  const doc = h.doc;
  const s = autoSettings(doc);
  useEffect(() => {
    void loadBank();
  }, []);
  const analysis = useMemo(() => analysisOf(bank), [bank.statements, bank.rules, bank.overrides, bank.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const { input, hash } = useMemo(() => autoInputOf(bank, doc, analysis), [bank, doc, analysis]);

  useEffect(() => {
    if (!bank.loaded || !s.enabled || hash === s.inputHash) return;
    const hasData = bank.statements.length || bank.invoices.length || bank.gtd.length;
    if (!hasData && !doc.entries.some((e) => e.auto)) return;
    const built = buildAuto(input, getState().h.doc.subaccounts);
    actions.update((d) => applyAuto(d, built, hash));
    void fetchMissingRates(built.needRates);
  }, [hash, bank.loaded, s.enabled, s.inputHash]); // eslint-disable-line react-hooks/exhaustive-deps
}
