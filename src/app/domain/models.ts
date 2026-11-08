/**
 * Financial domain model. Pure types: no Angular, Firebase, or AI imports.
 * All money values are integers in the smallest currency unit (paise for INR).
 * See docs/architecture/FINANCIAL_ENGINE.md.
 */

/** Integer amount in minor units (paise). */
export type Paise = number;

/** Where a value came from; shown in the UI so users can correct it. */
export type Provenance = 'user' | 'calculated' | 'ai_estimate' | 'assumption';

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

export const INCOME_KINDS = ['salary', 'business', 'rental', 'freelance', 'interest_dividend', 'pension', 'other'] as const;
export type IncomeKind = (typeof INCOME_KINDS)[number];

export const EXPENSE_CATEGORIES = [
  'household', 'groceries', 'utilities', 'rent', 'insurance', 'medical', 'education',
  'transport', 'travel', 'subscriptions', 'entertainment', 'dining', 'shopping', 'investments', 'other',
] as const;

/** How needed an expense is. "investments" expenses are savings, not spending, whatever their tag. */
export const NEEDS = ['necessary', 'lifestyle', 'discretionary', 'unnecessary'] as const;
export type Need = (typeof NEEDS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const LIABILITY_KINDS = ['home_loan', 'vehicle_loan', 'personal_loan', 'education_loan', 'credit_card', 'other'] as const;
export type LiabilityKind = (typeof LIABILITY_KINDS)[number];

export const ASSET_KINDS = [
  'savings', 'fixed_deposit', 'ppf', 'epf', 'nps', 'mutual_fund', 'stocks', 'gold', 'real_estate', 'other',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const GOAL_CATEGORIES = [
  'emergency_fund', 'debt_payoff', 'insurance', 'education', 'home', 'vehicle', 'retirement',
  'travel', 'wedding', 'wealth', 'other',
] as const;
export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

interface Item {
  id: string;
  label: string;
  provenance: Provenance;
}

export interface IncomeSource extends Item {
  kind: IncomeKind;
  amount: Paise;
  frequency: Frequency;
  /** Whose income, for example "self" or "spouse". */
  earner: string;
}

export interface Expense extends Item {
  category: ExpenseCategory;
  amount: Paise;
  frequency: Frequency;
  /** Necessary spending counts toward emergency-fund needs. */
  need: Need;
}

export interface Liability extends Item {
  kind: LiabilityKind;
  outstanding: Paise;
  /** Monthly instalment (EMI) or minimum card payment. */
  monthlyPayment: Paise;
  /** Annual interest rate in percent, if known. */
  interestRate?: number;
}

export interface Asset extends Item {
  kind: AssetKind;
  value: Paise;
}

export interface FamilyMember extends Item {
  relation: string;
  age?: number;
  dependent: boolean;
}

export interface InsuranceCover {
  health?: boolean;
  term?: boolean;
}

export interface Goal extends Item {
  category: GoalCategory;
  target: Paise;
  saved: Paise;
  /** "YYYY-MM"; absent for open-ended goals. */
  targetDate?: string;
  /** 1 = highest. Set by the user; always wins over computed order. */
  priorityOverride?: number;
}

export interface Assumptions {
  /** Expected annual return on goal savings, percent. Default 0 (conservative). */
  expectedReturn: number;
  /** Annual inflation, percent (used for long-term goals). */
  inflation: number;
  /** Financial independence: invested assets needed as a multiple of annual expenses. */
  fiMultiple: number;
}

export interface FinancialProfile {
  /** Increments on every saved change; used as the AI context version. */
  version: number;
  currency: 'INR';
  incomes: IncomeSource[];
  expenses: Expense[];
  liabilities: Liability[];
  assets: Asset[];
  family: FamilyMember[];
  insurance: InsuranceCover;
  assumptions: Assumptions;
  /** True once the user finished onboarding at least once. */
  onboarded: boolean;
  /** Epoch ms of the last saved change; drives the update reminder. */
  updatedAt?: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = { expectedReturn: 0, inflation: 6, fiMultiple: 25 };

/**
 * Brings a stored profile up to the current shape. Profiles saved before the
 * three-level need tag had `essential: boolean`.
 */
export function normalizeProfile(raw: Partial<FinancialProfile> | null): FinancialProfile {
  const p = { ...emptyProfile(), ...(raw ?? {}) };
  p.expenses = p.expenses.map((e) => {
    const { essential, ...rest } = e as Expense & { essential?: boolean };
    return { ...rest, need: NEEDS.includes(rest.need) ? rest.need : essential === false ? 'discretionary' : 'necessary' };
  });
  return p;
}

export function emptyProfile(): FinancialProfile {
  return {
    version: 0,
    currency: 'INR',
    incomes: [],
    expenses: [],
    liabilities: [],
    assets: [],
    family: [],
    insurance: {},
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    onboarded: false,
  };
}

/** Liquid assets count toward the emergency fund. */
export const LIQUID_ASSETS: ReadonlySet<AssetKind> = new Set(['savings', 'fixed_deposit']);
/** Invested assets count toward financial independence (home is excluded). */
export const INVESTED_ASSETS: ReadonlySet<AssetKind> = new Set([
  'savings', 'fixed_deposit', 'ppf', 'epf', 'nps', 'mutual_fund', 'stocks', 'gold', 'other',
]);

// --- money helpers -----------------------------------------------------------
export function rupees(r: number): Paise {
  return Math.round(r * 100);
}

export function toRupees(p: Paise): number {
  return p / 100;
}

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
/** "₹1,50,000" (Indian digit grouping). */
export function formatInr(p: Paise): string {
  return INR.format(Math.round(p / 100));
}
