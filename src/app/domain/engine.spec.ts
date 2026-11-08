import { describe, expect, it } from 'vitest';
import { computeMetrics, financialWarnings, healthScore, monthsUntil, periodRange, planGoals, requiredMonthly, spendingBreakdown, suggestGoals, toMonthly } from './engine';
import { emptyProfile, formatInr, normalizeProfile, rupees, type FinancialProfile, type Goal } from './models';

const NOW = new Date(2026, 10, 7); // 7 Nov 2026

function profile(): FinancialProfile {
  const p = emptyProfile();
  p.incomes = [
    { id: 'i1', label: 'Salary', kind: 'salary', amount: rupees(150000), frequency: 'monthly', earner: 'self', provenance: 'user' },
    { id: 'i2', label: 'Spouse salary', kind: 'salary', amount: rupees(50000), frequency: 'monthly', earner: 'spouse', provenance: 'user' },
  ];
  p.expenses = [
    { id: 'e1', label: 'Household', category: 'household', amount: rupees(40000), frequency: 'monthly', need: 'necessary', provenance: 'user' },
    { id: 'e2', label: 'Travel', category: 'travel', amount: rupees(120000), frequency: 'yearly', need: 'discretionary', provenance: 'user' },
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

describe('spending breakdown', () => {
  it('splits income by need, loans, investments, and what is left', () => {
    const p = profile();
    p.expenses.push(
      { id: 'e3', label: 'Takeaway', category: 'dining', amount: rupees(6000), frequency: 'monthly', need: 'unnecessary', provenance: 'user' },
      { id: 'e4', label: 'SIP', category: 'investments', amount: rupees(20000), frequency: 'monthly', need: 'necessary', provenance: 'user' },
    );
    const m = computeMetrics(p);
    // Investments are saving: not in expenses, but reduce what is left.
    expect(m.monthlyExpenses).toBe(rupees(40000 + 10000 + 6000));
    expect(m.monthlyInvesting).toBe(rupees(20000));
    expect(m.monthlySurplus).toBe(rupees(200000 - 56000 - 25000 - 20000));
    expect(m.savingsRate).toBeCloseTo((200000 - 56000 - 25000) / 200000);
    expect(spendingBreakdown(p, m)).toEqual([
      { key: 'necessary', label: 'Necessary', amount: rupees(40000) },
      { key: 'discretionary', label: 'Discretionary', amount: rupees(10000) },
      { key: 'unnecessary', label: 'Unnecessary', amount: rupees(6000) },
      { key: 'debt', label: 'Loan payments', amount: rupees(25000) },
      { key: 'investments', label: 'Investments', amount: rupees(20000) },
      { key: 'savings', label: 'Left to save', amount: rupees(99000) },
    ]);
  });

  it('upgrades profiles saved with the old essential flag', () => {
    const old = { expenses: [{ id: 'x', label: 'Travel', category: 'travel', amount: 1, frequency: 'monthly', essential: false, provenance: 'user' }] };
    const p = normalizeProfile(old as never);
    expect(p.expenses[0]!.need).toBe('discretionary');
    expect('essential' in p.expenses[0]!).toBe(false);
    expect(normalizeProfile(null).expenses).toEqual([]);
  });
});

describe('warnings', () => {
  it('flags overspending, debt, a missing emergency fund, and goals at risk, most severe first', () => {
    const p = emptyProfile();
    p.incomes = [{ id: 'i', label: 'Salary', kind: 'salary', amount: rupees(100000), frequency: 'monthly', earner: 'self', provenance: 'user' }];
    p.expenses = [{ id: 'e', label: 'Rent', category: 'rent', amount: rupees(60000), frequency: 'monthly', need: 'necessary', provenance: 'user' }];
    p.liabilities = [{ id: 'l', label: 'Car loan', kind: 'vehicle_loan', outstanding: rupees(500000), monthlyPayment: rupees(45000), provenance: 'user' }];
    p.assets = [{ id: 'a', label: 'Savings', kind: 'savings', value: rupees(10000), provenance: 'user' }];
    p.updatedAt = NOW.getTime() - 9 * 86_400_000;
    const goal: Goal = { id: 'g', label: 'Car', category: 'vehicle', target: rupees(500000), saved: 0, targetDate: '2027-06', provenance: 'user' };
    const m = computeMetrics(p);
    const w = financialWarnings(p, m, planGoals([goal], m, p.assumptions, NOW), NOW);
    expect(w.map((x) => x.key)).toEqual(['overspending', 'stale', 'debt', 'emergency', 'goal:g']);
    expect(w[1]!.title).toBe('No updates for 9 days');
    expect(w[1]!.link).toBe('/app/updates');
  });

  it('stays quiet for a healthy plan updated recently, but notes an upcoming goal', () => {
    const p = profile();
    p.updatedAt = NOW.getTime() - 2 * 86_400_000;
    p.assets.push({ id: 'fd', label: 'FD', kind: 'fixed_deposit', value: rupees(400000), provenance: 'user' });
    const m = computeMetrics(p);
    const goal: Goal = { id: 'g', label: 'Trip', category: 'travel', target: rupees(100000), saved: rupees(20000), targetDate: '2027-05', provenance: 'user' };
    const w = financialWarnings(p, m, planGoals([goal], m, p.assumptions, NOW), NOW);
    expect(w.map((x) => x.key)).toEqual(['upcoming:g']);
    expect(w[0]!.detail).toContain('₹80,000 still needed');
  });
});

describe('period ranges', () => {
  it('covers day, Monday-start week, month, year, and a custom range', () => {
    const now = new Date(2026, 10, 7, 15, 30); // Saturday
    const r = (p: Parameters<typeof periodRange>[0], c?: { from: string; to: string }) => {
      const x = periodRange(p, now, c);
      return x && [x.from.toDateString(), x.to.toDateString()];
    };
    expect(r('day')).toEqual([new Date(2026, 10, 7).toDateString(), new Date(2026, 10, 8).toDateString()]);
    expect(r('week')).toEqual([new Date(2026, 10, 2).toDateString(), new Date(2026, 10, 9).toDateString()]);
    expect(r('month')).toEqual([new Date(2026, 10, 1).toDateString(), new Date(2026, 11, 1).toDateString()]);
    expect(r('year')).toEqual([new Date(2026, 0, 1).toDateString(), new Date(2027, 0, 1).toDateString()]);
    expect(r('custom', { from: '2026-10-01', to: '2026-10-31' })).toEqual([new Date(2026, 9, 1).toDateString(), new Date(2026, 10, 1).toDateString()]);
    expect(r('custom', { from: '2026-10-31', to: '2026-10-01' })).toBeNull();
    expect(r('custom')).toBeNull();
  });
});
