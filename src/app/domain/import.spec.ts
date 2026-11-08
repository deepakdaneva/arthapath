import { describe, expect, it } from 'vitest';
import { rupees } from './models';
import { csvToRows, detectColumns, markDuplicates, parseCsv, parseMoney, parseStatementDate, textToRows } from './import';
import type { Transaction } from './transactions';

describe('CSV', () => {
  it('parses quotes, escaped quotes, CRLF, and other delimiters', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('x;y\n1;2')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });

  it('reads a withdrawal/deposit export after preamble rows', () => {
    const csv = [
      'HDFC BANK Ltd.,,,,,,',
      'Statement of account,,,,,,',
      'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
      '05/11/26,UPI-SWIGGY-swiggy@icici-ICIC0000001,0000431,05/11/26,"1,250.00",,"54,750.00"',
      '01/11/26,SALARY NOV 2026 ACME LTD,,01/11/26,,"1,50,000.00","56,000.00"',
      '03/11/26,NACH DR ICICI PRU SIP,,03/11/26,"5,000.00",,"51,000.00"',
      ',Opening balance,,,,,',
    ].join('\n');
    const out = csvToRows(csv)!;
    expect(out.skipped).toBe(1);
    expect(out.rows.map((r) => [r.date, r.type, r.amount, r.category])).toEqual([
      ['2026-11-05', 'expense', rupees(1250), 'dining'],
      ['2026-11-01', 'income', rupees(150000), 'income'],
      ['2026-11-03', 'investment', rupees(5000), 'investments'],
    ]);
  });

  it('reads a signed amount column with a Dr/Cr flag', () => {
    const csv = 'Txn Date,Description,Amount (INR),Dr/Cr\n2026-11-02,AMAZON PAY INDIA,899.00,DR\n2026-11-04,REFUND AMAZON,899.00,CR';
    const out = csvToRows(csv)!;
    expect(out.rows.map((r) => [r.type, r.amount])).toEqual([
      ['expense', rupees(899)],
      ['income', rupees(899)],
    ]);
    expect(detectColumns(parseCsv('foo,bar\n1,2'))).toBeNull();
  });
});

describe('statement text (PDF or pasted)', () => {
  it('takes the amount before the balance and reads Cr/Dr', () => {
    const text = [
      'Date Description Amount Balance',
      '05 Nov 2026 UPI/ZOMATO/Order 1234 450.00 Dr 1,02,550.00',
      '06-11-2026 NEFT CR ACME PAYROLL 1,50,000.00 Cr 2,52,550.00',
      '07/11/2026 POS DMART BANGALORE 2,310.50 2,50,239.50',
      'Page 1 of 3',
    ].join('\n');
    const out = textToRows(text);
    expect(out.rows.map((r) => [r.date, r.type, r.amount, r.category])).toEqual([
      ['2026-11-05', 'expense', rupees(450), 'dining'],
      ['2026-11-06', 'income', rupees(150000), 'income'],
      ['2026-11-07', 'expense', 231050, 'groceries'],
    ]);
  });
});

describe('dates, money, duplicates', () => {
  it('parses Indian statement formats, day first', () => {
    expect(parseStatementDate('05/11/26')).toBe('2026-11-05');
    expect(parseStatementDate('5-Nov-2026')).toBe('2026-11-05');
    expect(parseStatementDate('2026-11-05 10:22')).toBe('2026-11-05');
    expect(parseStatementDate('31/02/2026')).toBeNull();
    expect(parseMoney('₹ 1,23,456.78')).toBe(123456.78);
    expect(parseMoney('-200.00')).toBe(200);
    expect(parseMoney('')).toBeNull();
  });

  it('flags rows already saved or repeated in the same import', () => {
    const rows = textToRows('05/11/2026 SWIGGY 450.00 Dr 9,000.00\n05/11/2026 SWIGGY 450.00 Dr 8,550.00\n06/11/2026 UBER 300.00 Dr 8,250.00').rows;
    const saved: Transaction = { id: 's', type: 'expense', amount: rupees(300), date: '2026-11-06', category: 'transport', need: 'necessary', description: 'Uber to office', source: 'parser', createdAt: 0 };
    expect(markDuplicates(rows, [saved])).toEqual([false, true, true]);
  });
});
