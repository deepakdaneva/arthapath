/**
 * Deterministic financial calculations. AI never computes these numbers; it
 * only explains them. Every function is pure and unit-tested.
 */
import {
  INVESTED_ASSETS,
  LIQUID_ASSETS,
  formatInr,
  type Need,
  type Assumptions,
  type FinancialProfile,
  type Frequency,
  type Goal,
  type GoalCategory,
  type Paise,
} from './models';

const PER_MONTH: Record<Frequency, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  half_yearly: 1 / 6,
  yearly: 1 / 12,
};

export function toMonthly(amount: Paise, frequency: Frequency): Paise {
  return Math.round(amount * PER_MONTH[frequency]);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface Metrics {
  monthlyIncome: Paise;
  /** Living expenses, excluding loan payments and regular investments. */
  monthlyExpenses: Paise;
  monthlyDebtPayments: Paise;
  /** Regular investments (SIPs, RDs, PPF contributions): saving, not spending. */
  monthlyInvesting: Paise;
  /** Left over each month: income minus expenses, loan payments, and investments. */
  monthlySurplus: Paise;
  essentialMonthly: Paise;
  /** Share of income saved or invested (0.2 = 20%); null when income is unknown. */
  savingsRate: number | null;
  debtToIncome: number | null;
  liquidAssets: Paise;
  investedAssets: Paise;
  totalAssets: Paise;
  totalLiabilities: Paise;
  /** Months of essential spending (and loan payments) covered by liquid assets; null if unknown. */
  emergencyMonths: number | null;
  /** Null until any asset or liability is reported. */
  netWorth: Paise | null;
  /** Fraction of the financial-independence target reached; null if expenses are unknown. */
  fiProgress: number | null;
  fiTarget: Paise | null;
}

export function computeMetrics(p: FinancialProfile): Metrics {
  const monthlyIncome = sum(p.incomes.map((i) => toMonthly(i.amount, i.frequency)));
  const spending = p.expenses.filter((e) => e.category !== 'investments');
  const monthlyExpenses = sum(spending.map((e) => toMonthly(e.amount, e.frequency)));
  const monthlyInvesting = sum(p.expenses.filter((e) => e.category === 'investments').map((e) => toMonthly(e.amount, e.frequency)));
  const essentialLiving = sum(spending.filter((e) => e.need === 'necessary').map((e) => toMonthly(e.amount, e.frequency)));
  const monthlyDebtPayments = sum(p.liabilities.map((l) => l.monthlyPayment));
  const liquidAssets = sum(p.assets.filter((a) => LIQUID_ASSETS.has(a.kind)).map((a) => a.value));
  const investedAssets = sum(p.assets.filter((a) => INVESTED_ASSETS.has(a.kind)).map((a) => a.value));
  const totalAssets = sum(p.assets.map((a) => a.value));
  const totalLiabilities = sum(p.liabilities.map((l) => l.outstanding));
  const essentialMonthly = essentialLiving + monthlyDebtPayments;
  const hasIncome = monthlyIncome > 0;
  const annualExpenses = (monthlyExpenses + monthlyDebtPayments) * 12;
  const fiTarget = annualExpenses > 0 ? Math.round(annualExpenses * p.assumptions.fiMultiple) : null;

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlyDebtPayments,
    monthlyInvesting,
    monthlySurplus: monthlyIncome - monthlyExpenses - monthlyDebtPayments - monthlyInvesting,
    essentialMonthly,
    savingsRate: hasIncome ? (monthlyIncome - monthlyExpenses - monthlyDebtPayments) / monthlyIncome : null,
    debtToIncome: hasIncome ? monthlyDebtPayments / monthlyIncome : null,
    liquidAssets,
    investedAssets,
    totalAssets,
    totalLiabilities,
    emergencyMonths: essentialMonthly > 0 && p.assets.length > 0 ? liquidAssets / essentialMonthly : null,
    netWorth: p.assets.length || p.liabilities.length ? totalAssets - totalLiabilities : null,
    fiProgress: fiTarget ? Math.min(investedAssets / fiTarget, 1) : null,
    fiTarget,
  };
}

/** Whole months from `now` until "YYYY-MM" (end of that month); at least 0. */
export function monthsUntil(targetDate: string, now: Date): number {
  const [y, m] = targetDate.split('-').map(Number);
  if (!y || !m) return 0;
  return Math.max(0, (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1)));
}

/**
 * Monthly contribution to grow `saved` into `target` over `months` at an
 * annual return (percent), compounded monthly:
 *   FV = PV(1+r)^n + PMT((1+r)^n - 1)/r  →  PMT = (FV - PV(1+r)^n) r / ((1+r)^n - 1)
 */
export function requiredMonthly(target: Paise, saved: Paise, months: number, annualReturnPct: number): Paise {
  const remaining = target - saved;
  if (remaining <= 0) return 0;
  if (months <= 0) return remaining;
  const r = annualReturnPct / 100 / 12;
  if (r === 0) return Math.ceil(remaining / months);
  const g = (1 + r) ** months;
  return Math.max(0, Math.ceil(((target - saved * g) * r) / (g - 1)));
}

export type GoalStatus = 'achieved' | 'on_track' | 'at_risk' | 'behind' | 'no_date';

export const STATUS_LABEL: Record<GoalStatus, string> = {
  achieved: 'Achieved',
  on_track: 'On track',
  at_risk: 'At risk',
  behind: 'Behind',
  no_date: 'No date',
};

export interface GoalPlan {
  goal: Goal;
  progress: number;
  remaining: Paise;
  monthsLeft: number | null;
  requiredMonthly: Paise | null;
  /** Monthly amount allocated from the surplus in priority order. */
  allocated: Paise;
  status: GoalStatus;
  rank: number;
  /** Plain-language reasons for the rank (deterministic). */
  reasons: string[];
}

const CATEGORY_WEIGHT: Record<GoalCategory, number> = {
  emergency_fund: 100,
  debt_payoff: 85,
  insurance: 80,
  education: 60,
  retirement: 55,
  home: 45,
  wedding: 45,
  vehicle: 35,
  travel: 25,
  wealth: 20,
  other: 20,
};

const CATEGORY_REASON: Partial<Record<GoalCategory, string>> = {
  emergency_fund: 'An emergency fund protects every other goal from unexpected costs.',
  debt_payoff: 'Paying off debt removes a guaranteed interest cost.',
  insurance: 'Insurance protects your family against large, sudden expenses.',
  education: 'Education has a fixed date that cannot easily move.',
  retirement: 'Retirement benefits most from starting early.',
};

/**
 * Orders goals: user overrides first, then by a deterministic score of
 * category importance, urgency, and feasibility. Allocates the monthly
 * surplus in that order to determine whether each goal is on track.
 */
export function planGoals(goals: Goal[], metrics: Metrics, assumptions: Assumptions, now: Date): GoalPlan[] {
  const base = goals.map((goal) => {
    const monthsLeft = goal.targetDate ? monthsUntil(goal.targetDate, now) : null;
    const req = monthsLeft === null ? null : requiredMonthly(goal.target, goal.saved, monthsLeft, assumptions.expectedReturn);
    const urgency = monthsLeft === null ? 0 : monthsLeft <= 12 ? 30 : monthsLeft <= 36 ? 20 : monthsLeft <= 84 ? 10 : 0;
    const feasible = req !== null && metrics.monthlySurplus > 0 && req <= metrics.monthlySurplus ? 10 : 0;
    return { goal, monthsLeft, req, score: CATEGORY_WEIGHT[goal.category] + urgency + feasible, urgency };
  });

  base.sort((a, b) => {
    const ao = a.goal.priorityOverride ?? Infinity;
    const bo = b.goal.priorityOverride ?? Infinity;
    if (ao !== bo) return ao - bo;
    return b.score - a.score || (a.monthsLeft ?? 1e9) - (b.monthsLeft ?? 1e9) || a.goal.label.localeCompare(b.goal.label);
  });

  let available = Math.max(0, metrics.monthlySurplus);
  return base.map((b, i) => {
    const remaining = Math.max(0, b.goal.target - b.goal.saved);
    const progress = b.goal.target > 0 ? Math.min(b.goal.saved / b.goal.target, 1) : 0;
    const need = b.req ?? 0;
    const allocated = Math.min(need, available);
    available -= allocated;
    const status: GoalStatus =
      remaining === 0
        ? 'achieved'
        : b.req === null
          ? 'no_date'
          : allocated >= need
            ? 'on_track'
            : allocated >= need * 0.5
              ? 'at_risk'
              : 'behind';
    const reasons: string[] = [];
    if (b.goal.priorityOverride !== undefined) reasons.push('You set this priority yourself.');
    if (CATEGORY_REASON[b.goal.category]) reasons.push(CATEGORY_REASON[b.goal.category]!);
    if (b.monthsLeft !== null && b.urgency >= 20) reasons.push(`It is due in ${b.monthsLeft} month${b.monthsLeft === 1 ? '' : 's'}.`);
    if (status === 'behind' || status === 'at_risk') reasons.push('Your current surplus does not fully cover the required monthly saving.');
    return { goal: b.goal, progress, remaining, monthsLeft: b.monthsLeft, requiredMonthly: b.req, allocated, status, rank: i + 1, reasons };
  });
}

// --- health score ------------------------------------------------------------
export interface ScoreComponent {
  key: 'savings' | 'emergency' | 'debt' | 'goals' | 'insurance';
  label: string;
  weight: number;
  /** 0–1, or null when the inputs are missing (excluded from the total). */
  value: number | null;
  explanation: string;
}

export interface HealthScore {
  /** 0–100, or null when no component can be computed. */
  score: number | null;
  components: ScoreComponent[];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function healthScore(p: FinancialProfile, m: Metrics, plans: GoalPlan[]): HealthScore {
  const dated = plans.filter((g) => g.status !== 'no_date');
  const components: ScoreComponent[] = [
    {
      key: 'savings',
      label: 'Savings rate',
      weight: 25,
      value: m.savingsRate === null ? null : clamp01(m.savingsRate / 0.2),
      explanation: 'Full marks at 20% or more of income saved or invested each month.',
    },
    {
      key: 'emergency',
      label: 'Emergency fund',
      weight: 25,
      value: m.emergencyMonths === null ? null : clamp01(m.emergencyMonths / 6),
      explanation: 'Full marks at 6 months of necessary spending and loan payments in savings or deposits.',
    },
    {
      key: 'debt',
      label: 'Debt payments',
      weight: 25,
      value: m.debtToIncome === null ? null : clamp01((0.6 - m.debtToIncome) / 0.3),
      explanation: 'Full marks when loan payments are 30% of income or less; zero at 60% or more.',
    },
    {
      key: 'goals',
      label: 'Goals on track',
      weight: 15,
      value: dated.length ? dated.filter((g) => g.status === 'on_track' || g.status === 'achieved').length / dated.length : null,
      explanation: 'Share of dated goals your surplus fully funds.',
    },
    {
      key: 'insurance',
      label: 'Insurance basics',
      weight: 10,
      value:
        p.insurance.health === undefined && p.insurance.term === undefined
          ? null
          : (Number(!!p.insurance.health) + Number(!!p.insurance.term || !p.family.some((f) => f.dependent))) / 2,
      explanation: 'Health cover, plus term life cover if anyone depends on your income.',
    },
  ];
  const known = components.filter((c) => c.value !== null);
  const weight = sum(known.map((c) => c.weight));
  const score = weight ? Math.round((sum(known.map((c) => c.value! * c.weight)) / weight) * 100) : null;
  return { score, components };
}

// --- suggestions ----------------------------------------------------------------
export interface GoalSuggestion {
  category: GoalCategory;
  label: string;
  target: Paise;
  reason: string;
}

/** Goals the user may want to consider; never added automatically. */
export function suggestGoals(p: FinancialProfile, m: Metrics, goals: Goal[]): GoalSuggestion[] {
  const has = (c: GoalCategory) => goals.some((g) => g.category === c);
  const out: GoalSuggestion[] = [];
  if (!has('emergency_fund') && m.essentialMonthly > 0 && (m.emergencyMonths ?? 0) < 6) {
    out.push({
      category: 'emergency_fund',
      label: 'Emergency fund',
      target: m.essentialMonthly * 6,
      reason: `Six months of necessary spending and loan payments (${Math.round((m.emergencyMonths ?? 0) * 10) / 10} months covered now).`,
    });
  }
  const costly = p.liabilities.filter((l) => l.kind === 'credit_card' || l.kind === 'personal_loan' || (l.interestRate ?? 0) >= 12);
  if (!has('debt_payoff') && costly.length) {
    out.push({
      category: 'debt_payoff',
      label: 'Pay off high-interest debt',
      target: sum(costly.map((l) => l.outstanding)),
      reason: 'Credit card and personal loan interest usually exceeds what savings earn.',
    });
  }
  if (!has('insurance') && (p.insurance.health === false || (p.insurance.term === false && p.family.some((f) => f.dependent)))) {
    out.push({ category: 'insurance', label: 'Health and term insurance', target: 0, reason: 'Cover against medical costs and loss of income.' });
  }
  if (!has('retirement') && m.monthlyIncome > 0) {
    out.push({ category: 'retirement', label: 'Retirement', target: m.fiTarget ?? 0, reason: 'Long-term goals benefit most from starting early.' });
  }
  return out;
}

// --- spending breakdown --------------------------------------------------------
export type SliceKey = 'necessary' | 'discretionary' | 'unnecessary' | 'debt' | 'investments' | 'savings';

export interface Slice {
  key: SliceKey;
  label: string;
  /** Monthly amount. */
  amount: Paise;
}

export const SLICE_LABELS: Record<SliceKey, string> = {
  necessary: 'Necessary',
  discretionary: 'Discretionary',
  unnecessary: 'Unnecessary',
  debt: 'Loan payments',
  investments: 'Investments',
  savings: 'Left to save',
};

/**
 * Where each month's income goes. Slices with no amount are left out. When
 * spending exceeds income there is nothing left to save (warnings cover it).
 */
export function spendingBreakdown(p: FinancialProfile, m: Metrics): Slice[] {
  const byNeed = (need: Need) =>
    sum(p.expenses.filter((e) => e.category !== 'investments' && e.need === need).map((e) => toMonthly(e.amount, e.frequency)));
  const amounts: Record<SliceKey, Paise> = {
    necessary: byNeed('necessary'),
    discretionary: byNeed('discretionary'),
    unnecessary: byNeed('unnecessary'),
    debt: m.monthlyDebtPayments,
    investments: m.monthlyInvesting,
    savings: Math.max(0, m.monthlySurplus),
  };
  return (Object.keys(amounts) as SliceKey[]).filter((k) => amounts[k] > 0).map((key) => ({ key, label: SLICE_LABELS[key], amount: amounts[key] }));
}

// --- warnings -----------------------------------------------------------------
export type Severity = 'critical' | 'serious' | 'warning';

export interface Warning {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  /** In-app route for the details or the fix. */
  link: string;
}

/** Days without a saved update after which the user is reminded. */
export const UPDATE_REMINDER_DAYS = 7;

export function daysSince(epochMs: number | undefined, now: Date): number | null {
  return epochMs ? Math.floor((now.getTime() - epochMs) / 86_400_000) : null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Deterministic warnings, most severe first. Thresholds are common planning
 * rules of thumb, stated in each message so the user can judge them.
 */
export function financialWarnings(p: FinancialProfile, m: Metrics, plans: GoalPlan[], now: Date): Warning[] {
  const out: Warning[] = [];
  const inr = (x: Paise) => formatInr(x);
  const idle = daysSince(p.updatedAt, now);
  if (idle !== null && idle > UPDATE_REMINDER_DAYS) {
    out.push({
      key: 'stale',
      severity: 'serious',
      title: `No updates for ${idle} days`,
      detail: 'Log what changed (spending, income, savings) so ArthaPath can track trends and warn you early if a goal slips.',
      link: '/app/updates',
    });
  }
  if (m.monthlyIncome > 0) {
    if (m.monthlySurplus < 0) {
      out.push({
        key: 'overspending',
        severity: 'critical',
        title: 'Spending more than you earn',
        detail: `Expenses, loan payments, and investments exceed income by ${inr(-m.monthlySurplus)} a month.`,
        link: '/app/details/savings',
      });
    } else if (m.savingsRate !== null && m.savingsRate < 0.1) {
      out.push({
        key: 'low_savings',
        severity: 'warning',
        title: 'Low savings',
        detail: `You save or invest ${pct(m.savingsRate)} of income. Many plans aim for at least 20%.`,
        link: '/app/details/savings',
      });
    }
    const spent = (m.monthlyExpenses + m.monthlyDebtPayments) / m.monthlyIncome;
    if (spent > 0.8 && m.monthlySurplus >= 0) {
      out.push({
        key: 'high_spending',
        severity: 'serious',
        title: 'Most of your income is spent',
        detail: `Expenses and loan payments take ${pct(spent)} of income.`,
        link: '/app/details/necessary',
      });
    }
    const unnecessary = sum(p.expenses.filter((e) => e.category !== 'investments' && e.need === 'unnecessary').map((e) => toMonthly(e.amount, e.frequency)));
    if (unnecessary / m.monthlyIncome > 0.1) {
      out.push({
        key: 'unnecessary',
        severity: 'warning',
        title: 'Spending you marked unnecessary',
        detail: `${inr(unnecessary)} a month (${pct(unnecessary / m.monthlyIncome)} of income) goes to spending you marked unnecessary.`,
        link: '/app/details/unnecessary',
      });
    }
    if (m.debtToIncome !== null && m.debtToIncome > 0.4) {
      out.push({
        key: 'debt',
        severity: 'serious',
        title: 'High loan payments',
        detail: `Loan payments take ${pct(m.debtToIncome)} of income. Lenders often treat more than 40% as stretched.`,
        link: '/app/details/debt',
      });
    }
  }
  if (m.essentialMonthly > 0 && (m.emergencyMonths ?? 0) < 3) {
    const months = m.emergencyMonths ?? 0;
    out.push({
      key: 'emergency',
      severity: months < 1 ? 'serious' : 'warning',
      title: months < 1 ? 'No emergency fund' : 'Small emergency fund',
      detail: `Savings and deposits cover ${Math.round(months * 10) / 10} months of necessary spending and loan payments. Aim for 3 to 6.`,
      link: '/app/details/emergency',
    });
  }
  for (const g of plans) {
    if (g.status === 'behind' || g.status === 'at_risk') {
      out.push({
        key: `goal:${g.goal.id}`,
        severity: g.status === 'behind' ? 'serious' : 'warning',
        title: `${g.goal.label} is ${g.status === 'behind' ? 'behind schedule' : 'at risk'}`,
        detail: `Needs ${inr(g.requiredMonthly ?? 0)} a month; your plan can set aside ${inr(g.allocated)}.`,
        link: `/app/details/goal/${g.goal.id}`,
      });
    } else if (g.status !== 'achieved' && g.monthsLeft !== null && g.monthsLeft <= 12) {
      out.push({
        key: `upcoming:${g.goal.id}`,
        severity: 'warning',
        title: `${g.goal.label} is coming up`,
        detail: `Due in ${g.monthsLeft} month${g.monthsLeft === 1 ? '' : 's'}; ${inr(g.remaining)} still needed.`,
        link: `/app/details/goal/${g.goal.id}`,
      });
    }
  }
  const rank: Record<Severity, number> = { critical: 0, serious: 1, warning: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// --- date ranges for detail filters -------------------------------------------------
export type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

/** Inclusive start and exclusive end (local time) for a filter period. Weeks start on Monday. */
export function periodRange(period: Period, now: Date, custom?: { from: string; to: string }): { from: Date; to: Date } | null {
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  switch (period) {
    case 'day':
      return { from: new Date(y, mo, d), to: new Date(y, mo, d + 1) };
    case 'week': {
      const offset = (now.getDay() + 6) % 7;
      return { from: new Date(y, mo, d - offset), to: new Date(y, mo, d - offset + 7) };
    }
    case 'month':
      return { from: new Date(y, mo, 1), to: new Date(y, mo + 1, 1) };
    case 'year':
      return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
    case 'custom': {
      if (!custom?.from || !custom.to) return null;
      const [fy, fm, fd] = custom.from.split('-').map(Number);
      const [ty, tm, td] = custom.to.split('-').map(Number);
      const from = new Date(fy!, fm! - 1, fd!);
      const to = new Date(ty!, tm! - 1, td! + 1);
      return from < to ? { from, to } : null;
    }
  }
}
