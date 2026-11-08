/**
 * AI fallback for Updates: used only when the on-device parser finds no
 * amount. The model returns JSON; every field is validated here, and the
 * user reviews the result before anything is saved.
 */
import { EXPENSE_CATEGORIES, NEEDS, type Goal, type Need } from '../domain/models';
import { PAYMENT_METHODS, TX_TYPES, defaultNeed, isoDate, type PaymentMethod, type TxDraft, type TxType } from '../domain/transactions';
import { redacted } from './redact';

export function updatePrompt(today: Date, goals: Goal[]): string {
  return `You turn a person's note about money they spent, received, saved, or invested into structured entries for a personal finance app in India. Today is ${isoDate(today)}.
Respond with one JSON object only:
{"entries": [{"type": "${TX_TYPES.join('|')}", "amount": 0, "date": "YYYY-MM-DD", "category": "${EXPENSE_CATEGORIES.join('|')}|income|savings|loan|transfer|<short custom category>", "need": "${NEEDS.join('|')}|null", "method": "${PAYMENT_METHODS.join('|')}|null", "merchant": "name or null", "description": "short", "goal": "one of the goal names below, or null"}]}
Rules: amounts in rupees as numbers (1.5k = 1500, 2 lakh = 200000). Use an empty list when no amount is stated; never guess an amount. Dates are never in the future; default to today. "need" only for expenses: necessary (essentials), lifestyle (regular comforts), discretionary (occasional wants); use "unnecessary" only when the person says so. Link a goal only for savings or investments the person says are for it.
Goal names: ${goals.length ? goals.map((g) => JSON.stringify(g.label)).join(', ') : 'none'}.`;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, xs: readonly T[]): T | undefined => (xs.includes(v as T) ? (v as T) : undefined);

/** Validates the model's JSON into drafts; drops anything malformed. */
export function parseAiUpdate(text: string, now: Date, goals: Goal[]): TxDraft[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const entries = isObj(raw) && Array.isArray(raw['entries']) ? raw['entries'].slice(0, 10) : [];
  const today = isoDate(now);
  return entries.filter(isObj).flatMap((e): TxDraft[] => {
    const type = oneOf<TxType>(e['type'], TX_TYPES);
    const amount = typeof e['amount'] === 'number' && e['amount'] > 0 && e['amount'] <= 1e11 ? Math.round(e['amount'] * 100) : null;
    if (!type || !amount) return [];
    const date = typeof e['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e['date']) && e['date'] <= today ? e['date'] : today;
    const rawCat = typeof e['category'] === 'string' ? redacted(e['category'].trim().toLowerCase()).slice(0, 30) : '';
    const category = type === 'expense' ? rawCat || 'other' : ({ income: 'income', investment: 'investments', saving: 'savings', loan_payment: 'loan', transfer: 'transfer' } as const)[type];
    const description = typeof e['description'] === 'string' ? redacted(e['description']).slice(0, 120) : '';
    const method = oneOf<PaymentMethod>(e['method'], PAYMENT_METHODS);
    const merchant = typeof e['merchant'] === 'string' && e['merchant'].trim() ? redacted(e['merchant'].trim()).slice(0, 60) : undefined;
    const goal = typeof e['goal'] === 'string' ? goals.find((g) => g.label.toLowerCase() === (e['goal'] as string).toLowerCase()) : undefined;
    const need: Need | undefined = type === 'expense' ? (oneOf<Need>(e['need'], NEEDS) ?? defaultNeed(category)) : undefined;
    return [
      {
        type,
        amount,
        date,
        category,
        ...(need ? { need } : {}),
        ...(method ? { method } : {}),
        ...(merchant ? { merchant } : {}),
        ...(goal && (type === 'investment' || type === 'saving') ? { goalId: goal.id } : {}),
        description,
        source: 'ai' as const,
      },
    ];
  });
}
