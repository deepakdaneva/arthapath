/**
 * Structured extraction of financial facts from the user's own words. The AI
 * returns JSON; this module validates every field before anything reaches
 * the profile, and the user reviews the result before it is saved.
 */
import { redacted } from './redact';
import {
  ASSET_KINDS,
  EXPENSE_CATEGORIES,
  GOAL_CATEGORIES,
  INCOME_KINDS,
  LIABILITY_KINDS,
  rupees,
  type Asset,
  type Expense,
  type FamilyMember,
  type Frequency,
  type Goal,
  type IncomeSource,
  type InsuranceCover,
  type Liability,
  type Provenance,
} from '../domain/models';

export interface PendingQuestionDraft {
  key: string;
  question: string;
  why: string;
  optional: boolean;
}

export interface Extraction {
  reply: string;
  incomes: IncomeSource[];
  expenses: Expense[];
  liabilities: Liability[];
  assets: Asset[];
  family: FamilyMember[];
  insurance: InsuranceCover;
  goals: Goal[];
  questions: PendingQuestionDraft[];
  done: boolean;
}

export const EXTRACTION_PROMPT = `You help a user describe their personal finances for planning.
From the user's latest message, extract only facts they stated. Never invent
amounts. Use the current profile (JSON) to avoid asking for known facts and
to recognise updates. Amounts are in rupees as plain numbers (1 lakh = 100000).

Respond with one JSON object only, matching:
{
  "reply": "short friendly reply (max 70 words): acknowledge, then ask the single most useful next question",
  "incomes": [{"label": "", "kind": "${INCOME_KINDS.join('|')}", "amount": 0, "frequency": "weekly|monthly|quarterly|half_yearly|yearly", "earner": "self|spouse|other", "estimated": false}],
  "expenses": [{"label": "", "category": "${EXPENSE_CATEGORIES.join('|')}", "amount": 0, "frequency": "monthly", "essential": true, "estimated": false}],
  "liabilities": [{"label": "", "kind": "${LIABILITY_KINDS.join('|')}", "outstanding": 0, "monthlyPayment": 0, "interestRate": null, "estimated": false}],
  "assets": [{"label": "", "kind": "${ASSET_KINDS.join('|')}", "value": 0, "estimated": false}],
  "family": [{"relation": "", "age": null, "dependent": true}],
  "insurance": {"health": null, "term": null},
  "goals": [{"label": "", "category": "${GOAL_CATEGORIES.join('|')}", "target": 0, "saved": 0, "targetDate": "YYYY-MM or null", "estimated": false}],
  "questions": [{"key": "short_id", "question": "", "why": "what it is needed for", "optional": false}],
  "done": false
}
Rules: use empty arrays when nothing applies. "estimated": true when the user
gave a rough figure or range (use the midpoint). For a goal without an amount,
estimate a typical target, set "estimated": true, and ask to confirm.
"questions" lists the important missing facts (income, essential expenses,
loans, savings, dependents, insurance, goal amounts and dates), at most 4.
"done" is true once income, main expenses, and at least one goal are known.`;

// --- validation --------------------------------------------------------------
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj).slice(0, 20) : []);
// Model output is free text: ID numbers are removed from every string field.
const str = (v: unknown, max = 80): string => (typeof v === 'string' ? redacted(v.trim()).slice(0, max) : '');
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const FREQS: readonly Frequency[] = ['weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly'];

/** Rupees → paise; rejects negative, non-finite, or absurd values (over ₹10,000 crore). */
function money(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/[,₹\s]/g, '')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e11) return null;
  return rupees(n);
}

const prov = (o: Obj): Provenance => (o['estimated'] === true ? 'ai_estimate' : 'user');
const id = () => crypto.randomUUID();
const month = (v: unknown): string | undefined => (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : undefined);

/** Parses and validates the model's JSON. Throws if it is not usable. */
export function parseExtraction(text: string): Extraction {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    const m = /\{[\s\S]*\}/.exec(cleaned);
    if (!m) throw new Error('No JSON in response');
    raw = JSON.parse(m[0]);
  }
  if (!isObj(raw)) throw new Error('Response is not an object');

  const incomes = arr(raw['incomes']).flatMap((o): IncomeSource[] => {
    const amount = money(o['amount']);
    if (!amount) return [];
    const kind = oneOf(o['kind'], INCOME_KINDS, 'other');
    return [{ id: id(), label: str(o['label']) || kind, kind, amount, frequency: oneOf(o['frequency'], FREQS, 'monthly'), earner: str(o['earner'], 30) || 'self', provenance: prov(o) }];
  });
  const expenses = arr(raw['expenses']).flatMap((o): Expense[] => {
    const amount = money(o['amount']);
    if (!amount) return [];
    const category = oneOf(o['category'], EXPENSE_CATEGORIES, 'other');
    return [{ id: id(), label: str(o['label']) || category, category, amount, frequency: oneOf(o['frequency'], FREQS, 'monthly'), essential: bool(o['essential']) ?? true, provenance: prov(o) }];
  });
  const liabilities = arr(raw['liabilities']).flatMap((o): Liability[] => {
    const outstanding = money(o['outstanding']) ?? 0;
    const monthlyPayment = money(o['monthlyPayment']) ?? 0;
    if (!outstanding && !monthlyPayment) return [];
    const kind = oneOf(o['kind'], LIABILITY_KINDS, 'other');
    const rate = typeof o['interestRate'] === 'number' && o['interestRate'] >= 0 && o['interestRate'] <= 60 ? o['interestRate'] : undefined;
    return [{ id: id(), label: str(o['label']) || kind, kind, outstanding, monthlyPayment, ...(rate !== undefined ? { interestRate: rate } : {}), provenance: prov(o) }];
  });
  const assets = arr(raw['assets']).flatMap((o): Asset[] => {
    const value = money(o['value']);
    if (!value) return [];
    const kind = oneOf(o['kind'], ASSET_KINDS, 'other');
    return [{ id: id(), label: str(o['label']) || kind, kind, value, provenance: prov(o) }];
  });
  const family = arr(raw['family']).flatMap((o): FamilyMember[] => {
    const relation = str(o['relation'], 30);
    if (!relation) return [];
    const age = typeof o['age'] === 'number' && o['age'] >= 0 && o['age'] < 120 ? Math.round(o['age']) : undefined;
    return [{ id: id(), label: relation, relation, ...(age !== undefined ? { age } : {}), dependent: bool(o['dependent']) ?? false, provenance: 'user' }];
  });
  const goals = arr(raw['goals']).flatMap((o): Goal[] => {
    const label = str(o['label']);
    if (!label) return [];
    const targetDate = month(o['targetDate']);
    return [{
      id: id(),
      label,
      category: oneOf(o['category'], GOAL_CATEGORIES, 'other'),
      target: money(o['target']) ?? 0,
      saved: money(o['saved']) ?? 0,
      ...(targetDate ? { targetDate } : {}),
      provenance: prov(o),
    }];
  });
  const ins = isObj(raw['insurance']) ? raw['insurance'] : {};
  const insurance: InsuranceCover = {
    ...(bool(ins['health']) !== undefined ? { health: bool(ins['health']) } : {}),
    ...(bool(ins['term']) !== undefined ? { term: bool(ins['term']) } : {}),
  };
  const questions = arr(raw['questions']).slice(0, 4).flatMap((o): PendingQuestionDraft[] => {
    const question = str(o['question'], 200);
    return question ? [{ key: str(o['key'], 40) || question.slice(0, 40), question, why: str(o['why'], 200), optional: o['optional'] === true }] : [];
  });

  return {
    reply: str(raw['reply'], 600) || 'Thanks. Tell me more about your finances.',
    incomes,
    expenses,
    liabilities,
    assets,
    family,
    insurance,
    goals,
    questions,
    done: raw['done'] === true,
  };
}

export function extractionIsEmpty(x: Extraction): boolean {
  return (
    !x.incomes.length && !x.expenses.length && !x.liabilities.length && !x.assets.length &&
    !x.family.length && !x.goals.length && x.insurance.health === undefined && x.insurance.term === undefined
  );
}
