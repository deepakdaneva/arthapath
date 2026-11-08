import { describe, expect, it } from 'vitest';
import { computeMetrics, healthScore, monthsUntil, planGoals, requiredMonthly, suggestGoals, toMonthly } from './engine';
import { emptyProfile, formatInr, rupees, type FinancialProfile, type Goal } from './models';

const NOW = new Date(2026, 10, 7); // 7 Nov 2026

function profile(): FinancialProfile {
  const p = emptyProfile();
  p.incomes = [
    { id: 'i1', label: 'Salary', kind: 'salary', amount: rupees(150000), frequency: 'monthly', earner: 'self', provenance: 'user' },
    { id: 'i2', label: 'Spouse salary', kind: 'salary', amount: rupees(50000), frequency: 'monthly', earner: 'spouse', provenance: 'user' },
  ];
  p.expenses = [
    { id: 'e1', label: 'Household', category: 'household', amount: rupees(40000), frequency: 'monthly', essential: true, provenance: 'user' },
    { id: 'e2', label: 'Travel', category: 'travel', amount: rupees(120000), frequency: 'yearly', essential: false, provenance: 'user' },
  ];
  p.liabilities = [
    { id: 'l1', label: 'Home loan', kind: 'home_loan', outstanding: rupees(3000000), monthlyPayment: rupees(25000), interestRate: 8.5, provenance: 'user' },
  ];
  p.assets = [
    { id: 'a1', label: 'Savings account', kind: 'savings', value: rupees(200000), provenance: 'user' },
    { id: 'a2', label: 'Mutual funds', kind: 'mutual_fund', value: rupees(800000), provenance: 'user' },
    { id: 'a3', label: 'Flat', kind: 'real_estate', value: rupees(6000000), provenance: 'user' },
  ];
  return p;
}

describe('money', () => {
  it('formats with Indian digit grouping', () => {
    expect(formatInr(rupees(150000))).toBe('₹1,50,000');
    expect(formatInr(rupees(12345678))).toBe('₹1,23,45,678');
  });

  it('normalizes frequencies to monthly', () => {
    expect(toMonthly(rupees(120000), 'yearly')).toBe(rupees(10000));
    expect(toMonthly(rupees(30000), 'quarterly')).toBe(rupees(10000));
    expect(toMonthly(rupees(1200), 'weekly')).toBe(rupees(5200));
  });
});

describe('metrics', () => {
  it('computes cash flow, ratios, coverage, and net worth', () => {
    const m = computeMetrics(profile());
    expect(m.monthlyIncome).toBe(rupees(200000));
    expect(m.monthlyExpenses).toBe(rupees(50000)); // 40,000 + 1,20,000/12
    expect(m.monthlyDebtPayments).toBe(rupees(25000));
    expect(m.monthlySurplus).toBe(rupees(125000));
    expect(m.savingsRate).toBeCloseTo(0.625);
    expect(m.debtToIncome).toBeCloseTo(0.125);
    expect(m.essentialMonthly).toBe(rupees(65000));
    expect(m.emergencyMonths).toBeCloseTo(200000 / 65000);
    expect(m.netWorth).toBe(rupees(200000 + 800000 + 6000000 - 3000000));
    expect(m.investedAssets).toBe(rupees(1000000)); // home excluded
    expect(m.fiTarget).toBe(rupees(75000 * 12 * 25));
    expect(m.fiProgress).toBeCloseTo(1000000 / (75000 * 12 * 25));
  });

  it('reports unknowns as null instead of zero', () => {
    const m = computeMetrics(emptyProfile());
    expect(m.savingsRate).toBeNull();
    expect(m.debtToIncome).toBeNull();
    expect(m.emergencyMonths).toBeNull();
    expect(m.netWorth).toBeNull();
    expect(m.fiProgress).toBeNull();
  });
});

describe('goals', () => {
  it('counts months to a target month', () => {
    expect(monthsUntil('2027-11', NOW)).toBe(12);
    expect(monthsUntil('2026-11', NOW)).toBe(0);
    expect(monthsUntil('2020-01', NOW)).toBe(0);
  });

  it('solves the monthly contribution (0% and with returns)', () => {
    expect(requiredMonthly(rupees(120000), 0, 12, 0)).toBe(rupees(10000));
    expect(requiredMonthly(rupees(100000), rupees(100000), 12, 0)).toBe(0);
    expect(requiredMonthly(rupees(100000), 0, 0, 0)).toBe(rupees(100000));
    // 10 lakh in 10 years at 12% p.a. compounded monthly ≈ ₹4,347/month
    expect(Math.round(requiredMonthly(rupees(1000000), 0, 120, 12) / 100)).toBe(4347);
    // Existing savings reduce the need
    expect(requiredMonthly(rupees(1000000), rupees(500000), 120, 12)).toBeLessThan(requiredMonthly(rupees(1000000), 0, 120, 12));
  });

  const goals: Goal[] = [
    { id: 'g1', label: 'Family vacation', category: 'travel', target: rupees(300000), saved: 0, targetDate: '2027-11', provenance: 'user' },
    { id: 'g2', label: 'Emergency fund', category: 'emergency_fund', target: rupees(390000), saved: rupees(200000), targetDate: '2027-05', provenance: 'user' },
    { id: 'g3', label: 'Car', category: 'vehicle', target: rupees(1000000), saved: 0, targetDate: '2029-11', provenance: 'user' },
  ];

  it('prioritizes emergency fund first and allocates surplus in order', () => {
    const m = computeMetrics(profile());
    const plans = planGoals(goals, m, profile().assumptions, NOW);
    expect(plans.map((p) => p.goal.id)).toEqual(['g2', 'g1', 'g3']);
    expect(plans[0]!.reasons.join(' ')).toContain('emergency fund');
    expect(plans.every((p) => p.status === 'on_track')).toBe(true);
  });

  it('marks goals behind when the surplus runs out, and respects overrides', () => {
    const m = { ...computeMetrics(profile()), monthlySurplus: rupees(40000) };
    const plans = planGoals(goals.map((g) => (g.id === 'g3' ? { ...g, priorityOverride: 1 } : g)), m, profile().assumptions, NOW);
    expect(plans[0]!.goal.id).toBe('g3');
    expect(plans[0]!.reasons[0]).toBe('You set this priority yourself.');
    expect(plans.some((p) => p.status === 'behind' || p.status === 'at_risk')).toBe(true);
  });
});

describe('health score', () => {
  it('combines components and explains each', () => {
    const p = profile();
    p.insurance = { health: true, term: false };
    const m = computeMetrics(p);
    const h = healthScore(p, m, planGoals([], m, p.assumptions, NOW));
    const byKey = Object.fromEntries(h.components.map((c) => [c.key, c.value]));
    expect(byKey['savings']).toBe(1);
    expect(byKey['debt']).toBe(1);
    expect(byKey['emergency']).toBeCloseTo(200000 / 65000 / 6);
    expect(byKey['goals']).toBeNull();
    expect(byKey['insurance']).toBe(1); // no dependents, so term cover is not required
    expect(h.score).toBeGreaterThan(80);
    expect(h.score).toBeLessThanOrEqual(100);
  });

  it('is null with no data and excludes unknown components', () => {
    const p = emptyProfile();
    expect(healthScore(p, computeMetrics(p), []).score).toBeNull();
  });
});

describe('suggestions', () => {
  it('suggests missing safety goals without adding them', () => {
    const p = profile();
    p.liabilities.push({ id: 'l2', label: 'Credit card', kind: 'credit_card', outstanding: rupees(60000), monthlyPayment: rupees(3000), provenance: 'user' });
    p.insurance = { health: false };
    const s = suggestGoals(p, computeMetrics(p), []);
    expect(s.map((x) => x.category)).toEqual(['emergency_fund', 'debt_payoff', 'insurance', 'retirement']);
    expect(s[0]!.target).toBe(rupees((40000 + 25000 + 3000) * 6));
  });
});
