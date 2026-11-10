import { createContext, useContext } from 'react';
import type { Report } from '../engine/checks';

export const ReportContext = createContext<Report | null>(null);

export function useReport(): Report {
  const r = useContext(ReportContext);
  if (!r) throw new Error('ReportContext missing');
  return r;
}
