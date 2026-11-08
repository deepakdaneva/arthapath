import { describe, expect, it } from 'vitest';
import { categorizeRequest, parseCategorized } from '../ai/import-categorize';
import { computeMetrics, planGoals } from './engine';
import { emptyProfile, rupees, type Goal } from './models';
import { missingInfo } from './questions';
import { recommendations } from './recommendations';

const NOW = new Date(2026, 10, 8);

describe('questions from missing data', () => {
  it('asks only once something is saved, and explains what depends on each answer', () => {
    expect(missingInfo(emptyProfile(), [])).toEqual([]);
    const p = emptyProfile();
    p.expenses = [{ id: 'e', label: 'Rent', category: 'rent', amount: rupees(20000), frequency: 'monthly', need: 'necessary', provenance: 'user' }];
    const goal: Goal = { id: 'g', label: 'Car', category: 'vehicle', target: rupees(500000), saved: 0, provenance: 'user' };
    const qs = missingInfo(p, [goal]);
    expect(qs.map((q) => q.key)).toEqual(['income', 'liquid_savings', 'health_insurance', 'term_insurance', 'family', 'goal_dates']);
    expect(qs[0]!.dependsOn).toContain('Savings rate');
    expect(qs.find((q) => q.key === 'health_insurance')!.quick).toBe('health');
    expect(qs.find((q) => q.key === 'goal_dates')!.question).toContain('Car');
  });

  it('stops asking once the answer is in the data', () => {
    const p = emptyProfile();
    p.incomes = [{ id: 'i', label: 'Salary', kind: 'salary', amount: rupees(100000), frequency: 'monthly', earner: 'self', provenance: 'user' }];
    p.expenses = [{ id: 'e', label: 'Rent', category: 'rent', amount: rupees(20000), frequency: 'monthly', need: 'necessary', provenance: 'user' }];
    p.assets = [{ id: 'a', label: 'Savings', kind: 'savings', value: rupees(100000), provenance: 'user' }];
    p.insurance = { health: true, term: false };
    p.family = [{ id: 'f', label: 'Spouse', relation: 'spouse', dependent: false, provenance: 'user' }];
    expect(missingInfo(p, [])).toEqual([]);
  });
});

describe('recommendations', () => {
  it('ranks costly debt, emergency fund, term cover, and goal gaps with their numbers', () => {
    const p = emptyProfile();
    p.incomes = [{ id: 'i', label: 'Salary', kind: 'salary', amount: rupees(100000), frequency: 'monthly', earner: 'self', provenance: 'user' }];
    p.expenses = [
      { id: 'e', label: 'Rent', category: 'rent', amount: rupees(30000), frequency: 'monthly', need: 'necessary', provenance: 'user' },
      { id: 'u', label: 'Takeaway', category: 'dining', amount: rupees(5000), frequency: 'monthly', need: 'unnecessary', provenance: 'user' },
    ];
    p.liabilities = [{ id: 'c', label: 'Credit card', kind: 'credit_card', outstanding: rupees(80000), monthlyPayment: rupees(5000), provenance: 'user' }];
    p.assets = [{ id: 'a', label: 'Savings', kind: 'savings', value: rupees(50000), provenance: 'user' }];
    p.family = [{ id: 'f', label: 'Child', relation: 'child', age: 4, dependent: true, provenance: 'user' }];
    const goal: Goal = { id: 'g', label: 'Car', category: 'vehicle', target: rupees(1200000), saved: 0, targetDate: '2027-11', provenance: 'user' };
    const m = computeMetrics(p);
    const recs = recommendations(p, m, planGoals([goal], m, p.assumptions, NOW));
    expect(recs.map((r) => r.key)).toEqual(['costly_debt', 'emergency', 'term', 'cut', 'goal:g']);
    expect(recs[1]!.detail).toContain('₹2,10,000'); // 6 × (30,000 + 5,000)
    expect(recs[2]!.detail).toContain('₹1,20,00,000'); // 10 × yearly income
  });
});

describe('AI categorization for imports', () => {
  it('sends only redacted descriptions and keeps the statement direction', () => {
    const inputs = [
      { i: 0, direction: 'out' as const, amount: 450, description: 'UPI/riya@okhdfcbank/dinner' },
      { i: 3, direction: 'in' as const, amount: 900, description: 'NEFT ACME' },
    ];
    expect(categorizeRequest(inputs)).not.toContain('riya@okhdfcbank');
    const out = parseCategorized(
      JSON.stringify({ rows: [
        { i: 0, type: 'expense', category: 'dining', need: 'unnecessary' },
        { i: 3, type: 'expense', category: 'shopping' },
        { i: 9, type: 'income', category: 'income' },
      ] }),
      inputs,
    );
    // "unnecessary" is never set by the AI; a credit cannot become an expense; unknown rows are ignored.
    expect(out).toEqual([{ i: 0, type: 'expense', category: 'dining' }]);
  });
});
