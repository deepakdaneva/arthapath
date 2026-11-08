/**
 * Questions that come from gaps in the saved data (no AI needed). They stay
 * open until the data exists or the user dismisses them. The AI adds its own
 * questions during onboarding; both kinds share one list.
 */
import type { FinancialProfile, Goal } from './models';

export interface DerivedQuestion {
  key: string;
  question: string;
  why: string;
  optional: boolean;
  /** What depends on the answer, shown to the user. */
  dependsOn: string[];
  /** Answerable with a yes/no button instead of a conversation. */
  quick?: 'health' | 'term';
}

export function missingInfo(p: FinancialProfile, goals: Goal[]): DerivedQuestion[] {
  const out: DerivedQuestion[] = [];
  const hasAny = p.incomes.length + p.expenses.length + p.assets.length + p.liabilities.length + goals.length > 0;
  if (!hasAny) return out;
  if (!p.incomes.length) {
    out.push({
      key: 'income',
      question: 'What is your monthly take-home income?',
      why: 'Needed to work out how much you can save each month.',
      optional: false,
      dependsOn: ['Savings rate', 'Health score', 'Goal plans', 'Loan burden'],
    });
  }
  if (!p.expenses.length) {
    out.push({
      key: 'expenses',
      question: 'What are your regular monthly expenses (rent, groceries, bills)?',
      why: 'Needed to see what is left to save and how big an emergency fund should be.',
      optional: false,
      dependsOn: ['Monthly surplus', 'Emergency fund target', 'Financial independence estimate'],
    });
  }
  if (!p.assets.some((a) => a.kind === 'savings' || a.kind === 'fixed_deposit')) {
    out.push({
      key: 'liquid_savings',
      question: 'How much do you have in savings accounts and fixed deposits?',
      why: 'This is your emergency cushion.',
      optional: false,
      dependsOn: ['Emergency fund coverage', 'Net worth'],
    });
  }
  if (p.insurance.health === undefined) {
    out.push({
      key: 'health_insurance',
      question: 'Do you have health insurance for your family?',
      why: 'A hospital bill without cover can undo years of saving.',
      optional: false,
      dependsOn: ['Insurance part of the health score', 'Recommendations'],
      quick: 'health',
    });
  }
  const dependents = p.family.some((f) => f.dependent);
  if (p.insurance.term === undefined && (dependents || !p.family.length)) {
    out.push({
      key: 'term_insurance',
      question: 'Do you have term life insurance?',
      why: 'If anyone depends on your income, term cover protects them.',
      optional: !dependents,
      dependsOn: ['Insurance part of the health score', 'Recommendations'],
      quick: 'term',
    });
  }
  if (!p.family.length) {
    out.push({
      key: 'family',
      question: 'Does anyone depend on your income (spouse, children, parents)?',
      why: 'Helps decide insurance needs and how cautious your plan should be.',
      optional: true,
      dependsOn: ['Insurance recommendations'],
    });
  }
  if (p.liabilities.some((l) => l.interestRate === undefined)) {
    out.push({
      key: 'loan_rates',
      question: 'What interest rate do your loans or cards charge?',
      why: 'Needed to tell whether paying a loan off early beats investing.',
      optional: true,
      dependsOn: ['Debt recommendations'],
    });
  }
  const undated = goals.filter((g) => !g.targetDate);
  if (undated.length) {
    out.push({
      key: 'goal_dates',
      question: `When do you want to reach ${undated.map((g) => g.label).slice(0, 3).join(', ')}?`,
      why: 'Without a date, ArthaPath cannot work out the monthly saving needed.',
      optional: false,
      dependsOn: ['Goal status', 'Monthly saving needed'],
    });
  }
  return out;
}
