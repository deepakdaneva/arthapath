import { describe, expect, it } from 'vitest';
import { rupees } from '../domain/models';
import { extractionIsEmpty, parseExtraction } from './extraction';

describe('parseExtraction', () => {
  it('converts rupees to paise and keeps valid facts', () => {
    const x = parseExtraction(
      JSON.stringify({
        reply: 'Got it.',
        incomes: [{ label: 'Salary', kind: 'salary', amount: 150000, frequency: 'monthly', earner: 'self' }],
        expenses: [{ label: 'Groceries', category: 'groceries', amount: '12,000', frequency: 'monthly', essential: true }],
        liabilities: [{ label: 'Home loan', kind: 'home_loan', outstanding: 3000000, monthlyPayment: 25000, interestRate: 8.5 }],
        assets: [{ label: 'PPF', kind: 'ppf', value: 500000 }],
        family: [{ relation: 'son', age: 8, dependent: true }],
        insurance: { health: true, term: null },
        goals: [{ label: 'Car', category: 'vehicle', target: 1000000, saved: 0, targetDate: '2029-11', estimated: true }],
        questions: [{ key: 'expenses', question: 'What are your monthly household expenses?', why: 'Needed for savings rate', optional: false }],
        done: false,
      }),
    );
    expect(x.incomes[0]).toMatchObject({ amount: rupees(150000), provenance: 'user' });
    expect(x.expenses[0]!.amount).toBe(rupees(12000));
    expect(x.liabilities[0]).toMatchObject({ monthlyPayment: rupees(25000), interestRate: 8.5 });
    expect(x.family[0]).toMatchObject({ relation: 'son', age: 8, dependent: true });
    expect(x.insurance).toEqual({ health: true });
    expect(x.goals[0]).toMatchObject({ target: rupees(1000000), targetDate: '2029-11', provenance: 'ai_estimate' });
    expect(x.questions).toHaveLength(1);
  });

  it('rejects invalid values instead of saving them', () => {
    const x = parseExtraction(
      JSON.stringify({
        reply: 'ok',
        incomes: [
          { label: 'Bad', kind: 'salary', amount: -5 },
          { label: 'Huge', kind: 'salary', amount: 1e15 },
          { label: 'Text', kind: 'salary', amount: 'lots' },
          { label: 'Odd kind', kind: 'lottery', amount: 1000, frequency: 'hourly' },
        ],
        goals: [{ label: 'Trip', category: 'travel', target: 50000, targetDate: '2027-13' }],
      }),
    );
    expect(x.incomes).toHaveLength(1);
    expect(x.incomes[0]).toMatchObject({ kind: 'other', frequency: 'monthly' });
    expect(x.goals[0]!.targetDate).toBeUndefined();
  });

  it('removes identity numbers from extracted text', () => {
    const x = parseExtraction(
      JSON.stringify({
        reply: 'Noted your PAN ABCPE1234F.',
        assets: [{ label: 'HDFC account 50100123456789', kind: 'savings', value: 200000 }],
      }),
    );
    expect(x.reply).toBe('Noted your PAN [PAN removed].');
    expect(x.assets[0]!.label).toBe('HDFC account [ending 6789]');
    expect(x.assets[0]!.value).toBe(rupees(200000));
  });

  it('accepts JSON wrapped in code fences or prose', () => {
    expect(parseExtraction('```json\n{"reply":"hi"}\n```').reply).toBe('hi');
    expect(parseExtraction('Here you go: {"reply":"hello"} thanks').reply).toBe('hello');
  });

  it('throws on unusable output', () => {
    expect(() => parseExtraction('no json here')).toThrow();
    expect(() => parseExtraction('[1,2]')).toThrow();
  });

  it('detects an empty extraction', () => {
    expect(extractionIsEmpty(parseExtraction('{"reply":"hi"}'))).toBe(true);
  });
});
