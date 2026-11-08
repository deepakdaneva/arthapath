/**
 * Logged activity ("Updates"): types, the on-device parser for one-line
 * entries, monthly aggregates, and the deterministic impact of a new entry.
 * Pure functions; the AI is only asked when this parser cannot find an amount.
 */
import { EXPENSE_CATEGORIES, NEEDS, formatInr, type ExpenseCategory, type FinancialProfile, type Goal, type Need, type Paise } from './models';
import { toMonthly } from './engine';

export const TX_TYPES = ['expense', 'income', 'investment', 'saving', 'loan_payment', 'transfer'] as const;
export type TxType = (typeof TX_TYPES)[number];

export const TX_TYPE_LABELS: Record<TxType, string> = {
  expense: 'Expense',
  income: 'Income',
  investment: 'Investment',
  saving: 'Saving',
  loan_payment: 'Loan repayment',
  transfer: 'Transfer',
};

export const PAYMENT_METHODS = ['upi', 'credit_card', 'debit_card', 'cash', 'net_banking', 'auto_debit', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: 'UPI',
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  cash: 'Cash',
  net_banking: 'Net banking',
  auto_debit: 'Auto-debit',
  other: 'Other',
};

export interface Transaction {
  id: string;
  type: TxType;
  amount: Paise;
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  /** An expense category, or the user's own (custom) category. */
  category: string;
  /** Expenses only. */
  need?: Need;
  method?: PaymentMethod;
  description: string;
  merchant?: string;
  goalId?: string;
  /** How the entry was understood: the on-device parser, the AI, or typed in the form. */
  source: 'parser' | 'ai' | 'form' | 'import';
  createdAt: number;
}

export type TxDraft = Omit<Transaction, 'id' | 'createdAt'>;

// --- dates ---------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthOf = (date: string) => date.slice(0, 7);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Finds a date in the text; defaults to today. Never returns a future date. */
export function parseDate(text: string, now: Date): string {
  const t = text.toLowerCase();
  const day = (offset: number) => isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
  if (/\bday before yesterday\b/.test(t)) return day(2);
  if (/\byesterday\b/.test(t)) return day(1);
  const ago = /\b(\d{1,2}) days? ago\b/.exec(t);
  if (ago) return day(Number(ago[1]));

  const build = (y: number, m: number, d: number): string | null => {
    const date = new Date(y, m, d);
    if (date.getMonth() !== m || date.getDate() !== d) return null;
    // A date later this year without a year most likely meant last year.
    if (date > now) date.setFullYear(date.getFullYear() - 1);
    return date > now ? null : isoDate(date);
  };
  const num = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(t);
  if (num) {
    const y = num[3] ? (num[3].length === 2 ? 2000 + Number(num[3]) : Number(num[3])) : now.getFullYear();
    const r = build(y, Number(num[2]) - 1, Number(num[1]));
    if (r) return r;
  }
  const named =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(t) ??
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(t);
  if (named) {
    const [d, m] = /^\d/.test(named[1]!) ? [named[1]!, named[2]!] : [named[2]!, named[1]!];
    const r = build(now.getFullYear(), MONTHS.indexOf(m), Number(d));
    if (r) return r;
  }
  return isoDate(now);
}

// --- amounts -------------------------------------------------------------------
const AMOUNT =
  /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|lac|cr|crore)?\b|\b(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|l|lakh|lakhs|lac|cr|crore)?\b(?!\s*(?:%|days?|months?|years?|am|pm|st|nd|rd|th\b))/gi;
const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, cr: 1e7, crore: 1e7 };

/** Amounts in rupees found in the text, skipping dates and percentages. */
export function findAmounts(text: string): number[] {
  const withoutDates = text.replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ').replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, ' ').replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/gi, ' ').replace(/\b\d+ days? ago\b/gi, ' ');
  const out: number[] = [];
  for (const m of withoutDates.matchAll(AMOUNT)) {
    const raw = (m[1] ?? m[3])!.replace(/,/g, '');
    const unit = (m[2] ?? m[4])?.toLowerCase();
    const n = Number(raw) * (unit ? MULT[unit]! : 1);
    // Bare small numbers without ₹ are usually counts ("2 coffees"), not money.
    if (!Number.isFinite(n) || n <= 0 || n > 1e11) continue;
    if (!m[1] && !unit && n < 10) continue;
    out.push(Math.round(n * 100) / 100);
  }
  return out;
}

// --- classification ------------------------------------------------------------
const TYPE_RULES: [TxType, RegExp][] = [
  ['loan_payment', /\b(emi|loan|repaid|repay|repayment|prepay|credit card bill|card bill|cc bill)\b/i],
  ['investment', /\b(invest(ed|ment)?|sip|mutual funds?|mf|stocks?|shares|nps|ppf|elss|gold bond|sgb|etf)\b/i],
  ['saving', /\b(saved|save|savings|fixed deposit|fd|rd|recurring deposit|emergency fund|set aside|put aside)\b/i],
  ['income', /\b(received|receive|got paid|salary|credited|earned|income|freelance|bonus|refund|cashback|interest received|dividend|rent received)\b/i],
  ['transfer', /\b(transferred|transfer|moved|sent to (my|own)|self transfer)\b/i],
];

const CATEGORY_RULES: [ExpenseCategory, RegExp][] = [
  ['groceries', /\b(grocer(y|ies)|vegetables?|fruits?|milk|bigbasket|blinkit|zepto|dmart|kirana|supermarket)\b/i],
  ['dining', /\b(restaurant|zomato|swiggy|dinner|lunch|breakfast|coffee|cafe|tea|snacks?|food|pizza|eat(ing)? out)\b/i],
  ['transport', /\b(fuel|petrol|diesel|cng|uber|ola|rapido|metro|cab|taxi|auto|bus|parking|toll|fastag)\b/i],
  ['utilities', /\b(electricity|power bill|water bill|gas bill|lpg|cylinder|broadband|wifi|internet|recharge|mobile bill|phone bill|dth)\b/i],
  ['rent', /\b(rent|house rent|pg)\b/i],
  ['medical', /\b(doctor|pharmacy|medicines?|hospital|clinic|medical|lab test|dentist)\b/i],
  ['education', /\b(school|tuition|fees|course|books?|college|coaching)\b/i],
  ['subscriptions', /\b(netflix|spotify|prime|hotstar|ott|subscription|youtube premium|icloud|membership|gym)\b/i],
  ['entertainment', /\b(movies?|cinema|concert|games?|party|outing)\b/i],
  ['travel', /\b(flight|hotel|trip|train|irctc|holiday|vacation|airbnb|travel)\b/i],
  ['shopping', /\b(amazon|flipkart|myntra|clothes|shoes|shopping|electronics|ajio|nykaa|gift)\b/i],
  ['insurance', /\b(insurance|premium|policy)\b/i],
  ['household', /\b(maid|cook|household|house help|cleaning|repairs?|plumber|electrician|furniture)\b/i],
];

const METHOD_RULES: [PaymentMethod, RegExp][] = [
  ['credit_card', /\b(credit card|cc)\b/i],
  ['debit_card', /\bdebit card\b/i],
  ['upi', /\b(upi|gpay|google pay|phonepe|paytm|bhim)\b/i],
  ['cash', /\bcash\b/i],
  ['net_banking', /\b(net ?banking|neft|imps|rtgs|bank transfer)\b/i],
  ['auto_debit', /\b(auto[- ]?debit|ecs|nach|standing instruction|mandate)\b/i],
];

const LIFESTYLE: ReadonlySet<string> = new Set(['dining', 'subscriptions']);
const DISCRETIONARY: ReadonlySet<string> = new Set(['entertainment', 'travel', 'shopping']);
/** Only the user's own words make spending "unnecessary". */
const UNNECESSARY = /\b(unnecessary|wasted?|waste of money|impulse|shouldn'?t have|regret|useless)\b/i;

/**
 * Type and category from free text (a note or a bank narration). `direction`
 * from a statement column wins over words: money in is income unless the
 * words say refund or transfer.
 */
export function classify(text: string, direction?: 'in' | 'out'): { type: TxType; category: string; need?: Need } {
  let type = TYPE_RULES.find(([, re]) => re.test(text))?.[0] ?? 'expense';
  if (direction === 'in' && type !== 'transfer') type = 'income';
  if (direction === 'out' && type === 'income') type = 'expense';
  const fixed: Partial<Record<TxType, string>> = { income: 'income', investment: 'investments', saving: 'savings', loan_payment: 'loan', transfer: 'transfer' };
  const category = fixed[type] ?? CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] ?? 'other';
  return { type, category, ...(type === 'expense' ? { need: defaultNeed(category, text) } : {}) };
}

export function defaultNeed(category: string, text = ''): Need {
  if (UNNECESSARY.test(text)) return 'unnecessary';
  if (LIFESTYLE.has(category)) return 'lifestyle';
  if (DISCRETIONARY.has(category)) return 'discretionary';
  return 'necessary';
}

function matchGoal(text: string, goals: Goal[]): string | undefined {
  const t = text.toLowerCase();
  const hit = /\b(?:for|towards?|to)\s+(?:my\s+|the\s+|our\s+)?([a-z][a-z ]{1,40}?)(?:\s+goal|\s+fund)?\b(?:[.,]|$)/.exec(t);
  const words = hit ? hit[1]!.split(/\s+/).filter((w) => w.length > 2) : [];
  const found = goals.find((g) => {
    const label = g.label.toLowerCase();
    return words.some((w) => label.includes(w)) || (t.includes(label) && label.length > 2);
  });
  return found?.id;
}

function merchantOf(text: string): string | undefined {
  const m = /\b(?:at|from|on)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,2})/.exec(text);
  return m && !MONTHS.includes(m[1]!.slice(0, 3).toLowerCase()) ? m[1] : undefined;
}

/**
 * Understands one-line entries on the device, for example "Spent ₹500 on
 * groceries via UPI" or "Received 10k from freelance work yesterday". Several
 * entries can be joined with "and" or commas when each has its own amount.
 * Returns an empty list when no amount is found (the caller may ask the AI).
 */
export function parseUpdate(input: string, now: Date, goals: Goal[] = []): TxDraft[] {
  const text = input.trim();
  if (!text) return [];
  // Commas inside numbers (12,000) are not separators.
  const parts = text.split(/\s*(?:,(?!\d)|;|\band\b|\balso\b|\n)\s*/i).filter(Boolean);
  // Split only when every part carries its own amount; otherwise read the whole line.
  const pieces = parts.length > 1 && parts.every((p) => findAmounts(p).length > 0) ? parts : [text];
  const date = parseDate(text, now);
  return pieces.flatMap((piece): TxDraft[] => {
    const amount = findAmounts(piece)[0];
    if (amount === undefined) return [];
    const ctx = pieces.length > 1 ? piece : text;
    const type = TYPE_RULES.find(([, re]) => re.test(ctx))?.[0] ?? 'expense';
    const category =
      type === 'investment' ? 'investments' : type === 'income' ? 'income' : type === 'loan_payment' ? 'loan' : type === 'saving' ? 'savings' : type === 'transfer' ? 'transfer' : (CATEGORY_RULES.find(([, re]) => re.test(ctx))?.[0] ?? 'other');
    const method = METHOD_RULES.find(([, re]) => re.test(ctx))?.[0];
    const merchant = merchantOf(piece);
    const goalId = type === 'investment' || type === 'saving' ? matchGoal(ctx, goals) : undefined;
    return [
      {
        type,
        amount: Math.round(amount * 100),
        date,
        category,
        ...(type === 'expense' ? { need: defaultNeed(category, ctx) } : {}),
        ...(method ? { method } : {}),
        ...(merchant ? { merchant } : {}),
        ...(goalId ? { goalId } : {}),
        description: piece.slice(0, 120),
        source: 'parser' as const,
      },
    ];
  });
}

// --- monthly aggregates ----------------------------------------------------------
/** Encrypted monthly totals (aggregates/{YYYY-MM}), kept in step with each saved or deleted entry. */
export interface MonthTotals {
  month: string;
  byType: Partial<Record<TxType, Paise>>;
  /** Expenses by category. */
  byCategory: Record<string, Paise>;
  /** Expenses by need. */
  byNeed: Partial<Record<Need, Paise>>;
  count: number;
  /** Epoch ms of the latest change; feeds the update reminder. */
  lastAt: number;
}

export const emptyTotals = (month: string): MonthTotals => ({ month, byType: {}, byCategory: {}, byNeed: {}, count: 0, lastAt: 0 });

/** Adds (sign 1) or removes (sign -1) one entry. Returns a new object. */
export function applyToTotals(t: MonthTotals, tx: Transaction, sign: 1 | -1, now: number): MonthTotals {
  const add = <K extends string>(rec: Partial<Record<K, number>>, key: K) => {
    const v = (rec[key] ?? 0) + sign * tx.amount;
    const next = { ...rec };
    if (v > 0) next[key] = v;
    else delete next[key];
    return next;
  };
  return {
    month: t.month,
    byType: add(t.byType, tx.type),
    byCategory: tx.type === 'expense' ? (add(t.byCategory, tx.category) as Record<string, Paise>) : t.byCategory,
    byNeed: tx.type === 'expense' && tx.need ? add(t.byNeed, tx.need) : t.byNeed,
    count: Math.max(0, t.count + sign),
    lastAt: now,
  };
}

// --- impact of a new entry (deterministic) ------------------------------------------
export interface Impact {
  tone: 'good' | 'neutral' | 'caution';
  text: string;
}

/** Planned monthly spending per category, from Your finances. */
export function plannedByCategory(p: FinancialProfile): Record<string, Paise> {
  const out: Record<string, Paise> = {};
  for (const e of p.expenses) {
    if (e.category === 'investments') continue;
    out[e.category] = (out[e.category] ?? 0) + toMonthly(e.amount, e.frequency);
  }
  return out;
}

const human = (s: string) => s.replace(/_/g, ' ');

/**
 * What a saved entry means for the month's plan, the linked goal, and the
 * recent trend. Uses only saved figures: no AI call.
 */
export function impactOf(
  tx: Transaction,
  month: MonthTotals,
  history: MonthTotals[],
  profile: FinancialProfile,
  goal: Goal | null,
  now: Date,
): Impact[] {
  const out: Impact[] = [];
  const inr = formatInr;
  if (tx.type === 'expense') {
    const planned = plannedByCategory(profile)[tx.category];
    const spent = month.byCategory[tx.category] ?? 0;
    if (planned) {
      const share = spent / planned;
      const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const pace = now.getDate() / daysIn;
      if (share > 1) {
        out.push({ tone: 'caution', text: `${inr(spent)} spent on ${human(tx.category)} this month: ${inr(spent - planned)} over your ${inr(planned)} plan.` });
      } else {
        out.push({
          tone: share > pace + 0.15 ? 'caution' : 'good',
          text: `${inr(spent)} of your ${inr(planned)} ${human(tx.category)} plan used (${Math.round(share * 100)}%)${share > pace + 0.15 ? ', ahead of the month\'s pace' : ''}.`,
        });
      }
    } else {
      out.push({ tone: 'neutral', text: `No monthly plan for ${human(tx.category)} yet. Add one in Your finances to track it.` });
    }
    const prev = history.filter((h) => h.month < month.month).slice(-3);
    if (prev.length) {
      const avg = prev.reduce((s, h) => s + (h.byCategory[tx.category] ?? 0), 0) / prev.length;
      if (avg > 0 && spent > avg * 1.25) {
        out.push({ tone: 'caution', text: `${human(tx.category)[0]!.toUpperCase() + human(tx.category).slice(1)} is ${Math.round((spent / avg - 1) * 100)}% above your recent monthly average (${inr(Math.round(avg))}).` });
      }
    }
    if (tx.need === 'unnecessary') out.push({ tone: 'caution', text: 'Marked unnecessary: worth cutting if it repeats.' });
  }
  const plannedTotal = Object.values(plannedByCategory(profile)).reduce((s, v) => s + v, 0);
  const spentTotal = month.byType.expense ?? 0;
  if (tx.type === 'expense' && plannedTotal > 0 && spentTotal > plannedTotal) {
    out.push({ tone: 'caution', text: `Total spending this month (${inr(spentTotal)}) is above your monthly plan (${inr(plannedTotal)}). Consider pausing discretionary spending.` });
  }
  if (goal && (tx.type === 'investment' || tx.type === 'saving')) {
    const pct = goal.target > 0 ? Math.min(goal.saved / goal.target, 1) : 0;
    out.push({ tone: 'good', text: `${goal.label}: ${inr(goal.saved)} of ${inr(goal.target)} saved (${Math.round(pct * 100)}%).` });
  }
  if (tx.type === 'income') out.push({ tone: 'good', text: `${inr(month.byType.income ?? 0)} received this month so far.` });
  return out;
}

export const NEED_OPTIONS = NEEDS;
export const CATEGORY_OPTIONS: readonly string[] = EXPENSE_CATEGORIES.filter((c) => c !== 'investments');
