import type { Rule } from '../classify';
import raw from './default-rules.json';

/** Built-in classification rules (src/bank/rules/default-rules.json). */
export const DEFAULT_RULES: Rule[] = raw as Rule[];
