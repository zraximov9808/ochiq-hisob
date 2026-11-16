import { useEffect, useMemo } from 'react';
import { companyInnOf } from '../../audit/invoices';
import { applyAuto, autoSettings } from '../../auto/apply';
import { shouldApply, tryBuildAuto, type AutoInput, type BuiltAuto } from '../../auto/build';
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

/** Fingerprint of everything uploaded (whole records, so any change in a file's content counts). */
export const dataFingerprint = (bank: BankState): string =>
  autoInputHash({ st: bank.statements, ov: bank.overrides, rules: bank.rules, bs: bank.settings, inv: bank.invoices, gtd: bank.gtd, q: bank.stockQty });

const hasData = (bank: BankState) => bank.statements.length > 0 || bank.invoices.length > 0 || bank.gtd.length > 0;

/** Everything the auto entries are built from, and a fingerprint that changes when any of it does. */
export function autoInputOf(bank: BankState, doc: Doc, analysis: Analysis | null, data = dataFingerprint(bank)): { input: AutoInput; hash: string } {
  const s = autoSettings(doc);
  const rates = { ...ratesFromGtd(bank.gtd), ...bank.rates, ...s.rates };
  const edited = doc.entries.filter((e) => e.auto?.edited);
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
    docCompanyInn: doc.company.stir,
    editedEntries: edited,
  };
  const hash = autoInputHash({
    data,
    rates,
    s: { ...s, inputHash: '', enabled: true },
    edited,
    stir: doc.company.stir,
    cap: doc.opening.some((o) => synthetic(o.account) === '8330' && o.credit > 0),
  });
  return { input, hash };
}

function useAutoInput() {
  const bank = useBank();
  const { h } = useApp();
  const doc = h.doc;
  const analysis = useMemo(() => analysisOf(bank), [bank.statements, bank.rules, bank.overrides, bank.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useMemo(() => dataFingerprint(bank), [bank.statements, bank.overrides, bank.rules, bank.settings, bank.invoices, bank.gtd, bank.stockQty]); // eslint-disable-line react-hooks/exhaustive-deps
  const { input, hash } = useMemo(() => autoInputOf(bank, doc, analysis, data), [bank, doc, analysis, data]);
  return { bank, doc, analysis, input, hash };
}

/** Input, fingerprint and a fresh build for the current data (used by the page to show warnings). */
export function useAutoBuild(): { input: AutoInput; hash: string; built: BuiltAuto; analysis: Analysis | null } {
  const { doc, analysis, input, hash } = useAutoInput();
  const built = useMemo(() => tryBuildAuto(input, doc.subaccounts), [input, doc.subaccounts]);
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

/** Writes freshly built auto entries now (also when automatic updating is off); joins the user's last step. */
export function rebuildNow(input: AutoInput, hash: string): BuiltAuto {
  const built = tryBuildAuto(input, getState().h.doc.subaccounts);
  if (!built.warnings.some((w) => w.kind === 'company' || w.kind === 'error')) actions.amend((d) => applyAuto(d, built, hash));
  void fetchMissingRates(built.needRates);
  return built;
}

/** Keeps the journal's auto entries in step with the uploaded documents. Mounted once in the app. */
export function useAutoSync(): void {
  const { bank, doc, input, hash } = useAutoInput();
  const s = autoSettings(doc);
  useEffect(() => {
    void loadBank();
  }, []);

  useEffect(() => {
    if (!bank.loaded) return;
    const company = !!input.docCompanyInn && !!input.companyInn && input.docCompanyInn.trim() !== input.companyInn.trim();
    // No data in this browser (another computer, data cleared) leaves the document's auto entries alone.
    if (!shouldApply({ enabled: s.enabled, hasData: hasData(bank), hash, inputHash: s.inputHash, company })) return;
    rebuildNow(input, hash);
  }, [hash, bank.loaded, s.enabled, s.inputHash]); // eslint-disable-line react-hooks/exhaustive-deps
}
