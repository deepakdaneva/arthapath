/**
 * Optional AI help for imports (Settings → "Let AI categorize imported
 * rows"). Only rows the device could not categorize are sent, as index,
 * direction, amount, and a redacted description: no dates, account numbers,
 * or balances. The answer is validated; the user still reviews every row.
 */
import { EXPENSE_CATEGORIES, NEEDS, type Need } from '../domain/models';
import { TX_TYPES, type TxType } from '../domain/transactions';
import { redacted } from './redact';

export interface CategorizeInput {
  i: number;
  direction: 'in' | 'out';
  amount: number;
  description: string;
}

export const IMPORT_CATEGORIZE_PROMPT = `You categorize bank statement rows for a personal finance app in India.
Input: a JSON list of {"i", "direction" ("in" = money received, "out" = money spent), "amount" (rupees), "description"}.
Respond with one JSON object only: {"rows": [{"i": 0, "type": "${TX_TYPES.join('|')}", "category": "${EXPENSE_CATEGORIES.join('|')}|income|savings|loan|transfer", "need": "${NEEDS.join('|')}|null"}]}
Rules: "in" rows are income or transfer. Use "need" only for expenses, and never "unnecessary". If unsure, use category "other".`;

export function categorizeRequest(rows: CategorizeInput[]): string {
  return JSON.stringify(rows.slice(0, 200).map((r) => ({ ...r, description: redacted(r.description).slice(0, 80) })));
}

export interface Categorized {
  i: number;
  type: TxType;
  category: string;
  need?: Need;
}

export function parseCategorized(text: string, inputs: CategorizeInput[]): Categorized[] {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(s, e + 1));
  } catch {
    return [];
  }
  const rows = (raw as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  const byIndex = new Map(inputs.map((r) => [r.i, r]));
  const allowed = new Set<string>([...EXPENSE_CATEGORIES, 'income', 'savings', 'loan', 'transfer']);
  return rows.flatMap((r): Categorized[] => {
    if (typeof r !== 'object' || r === null) return [];
    const o = r as Record<string, unknown>;
    const input = typeof o['i'] === 'number' ? byIndex.get(o['i']) : undefined;
    const type = TX_TYPES.includes(o['type'] as TxType) ? (o['type'] as TxType) : null;
    if (!input || !type) return [];
    // Direction from the statement always wins.
    if (input.direction === 'in' && type !== 'income' && type !== 'transfer') return [];
    if (input.direction === 'out' && type === 'income') return [];
    const category = typeof o['category'] === 'string' && allowed.has(o['category']) ? o['category'] : 'other';
    const need = type === 'expense' && NEEDS.includes(o['need'] as Need) && o['need'] !== 'unnecessary' ? (o['need'] as Need) : undefined;
    return [{ i: input.i, type, category, ...(need ? { need } : {}) }];
  });
}
