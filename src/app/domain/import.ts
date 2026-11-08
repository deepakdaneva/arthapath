/**
 * Statement import, entirely on the device: CSV exports in common bank
 * layouts, and text from PDFs or pasted statements. Produces drafts for the
 * review screen and flags likely duplicates. Nothing here is saved.
 */
import { classify, isoDate, type Transaction, type TxDraft } from './transactions';

// --- CSV ---------------------------------------------------------------------------
/** RFC 4180 CSV (quoted fields, escaped quotes, CRLF), with , ; or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row.map((f) => f.trim()));
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row.map((f) => f.trim()));
  return rows;
}

export interface ColumnMap {
  date: number;
  description: number;
  debit?: number;
  credit?: number;
  /** One signed amount column (with an optional Dr/Cr column). */
  amount?: number;
  drCr?: number;
}

const COL = {
  date: /^(txn |transaction |value |posting )?date$|^date\b|tran date|txn date/i,
  description: /narration|description|particulars|details|remarks|transaction details|merchant/i,
  debit: /withdrawal|debit|dr\.? amount|amount dr|paid out|money out/i,
  credit: /deposit|credit|cr\.? amount|amount cr|paid in|money in/i,
  amount: /^amount|txn amount|transaction amount|amount \(inr\)|amount\(inr\)/i,
  drCr: /^(dr\/cr|cr\/dr|type|dr \/ cr|debit\/credit)$/i,
};

/** Finds the header row (within the first 30 rows) and its columns. */
export function detectColumns(rows: string[][]): { header: number; map: ColumnMap } | null {
  for (let h = 0; h < Math.min(rows.length, 30); h++) {
    const r = rows[h]!;
    const find = (re: RegExp, not: number[] = []) => r.findIndex((c, i) => !not.includes(i) && re.test(c.trim()));
    const date = find(COL.date);
    const description = find(COL.description, [date]);
    if (date < 0 || description < 0) continue;
    const debit = find(COL.debit, [date, description]);
    const credit = find(COL.credit, [date, description, debit]);
    const amount = find(COL.amount, [date, description, debit, credit]);
    const drCr = find(COL.drCr, [date, description, debit, credit, amount]);
    if (debit >= 0 || credit >= 0) {
      return { header: h, map: { date, description, ...(debit >= 0 ? { debit } : {}), ...(credit >= 0 ? { credit } : {}) } };
    }
    if (amount >= 0) return { header: h, map: { date, description, amount, ...(drCr >= 0 ? { drCr } : {}) } };
  }
  return null;
}

// --- dates and amounts ----------------------------------------------------------------
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Statement dates: 05/11/2026, 05-11-26, 2026-11-05, 05 Nov 2026, 05-Nov-26. Day first (Indian banks). */
export function parseStatementDate(s: string): string | null {
  const t = s.trim().toLowerCase();
  const y4 = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  const ok = (y: number, m: number, d: number) => {
    const dt = new Date(y, m, d);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? isoDate(dt) : null;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return ok(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(t);
  if (m) return ok(y4(m[3]!), Number(m[2]) - 1, Number(m[1]));
  m = /^(\d{1,2})[\s/-]([a-z]{3})[a-z]*[\s/,-]*(\d{2,4})\b/.exec(t);
  if (m && MONTHS.includes(m[2]!)) return ok(y4(m[3]!), MONTHS.indexOf(m[2]!), Number(m[1]));
  return null;
}

/** "1,23,456.78", "₹ 500", "-200.00", "500.00 Dr" → rupees (absolute) or null. */
export function parseMoney(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[₹,\s]|inr|rs\.?/gi, '').replace(/(dr|cr)$/i, ''));
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
}

export interface ImportRow extends TxDraft {
  /** Original line or row, for the review screen (redacted before display). */
  raw: string;
}

function draft(date: string, description: string, rupees: number, direction: 'in' | 'out'): ImportRow {
  const desc = description.replace(/\s+/g, ' ').trim();
  const c = classify(desc, direction);
  return { ...c, amount: Math.round(rupees * 100), date, description: desc.slice(0, 120), source: 'import', raw: desc };
}

/** Rows from a CSV export. Rows without a valid date or amount are skipped. */
export function csvToRows(text: string): { rows: ImportRow[]; skipped: number } | null {
  const table = parseCsv(text);
  const found = detectColumns(table);
  if (!found) return null;
  const { header, map } = found;
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of table.slice(header + 1)) {
    const date = parseStatementDate(r[map.date] ?? '');
    const desc = r[map.description] ?? '';
    let amount: number | null = null;
    let direction: 'in' | 'out' = 'out';
    if (map.debit !== undefined || map.credit !== undefined) {
      const out = parseMoney(map.debit !== undefined ? r[map.debit] : undefined);
      const inn = parseMoney(map.credit !== undefined ? r[map.credit] : undefined);
      if (out) amount = out;
      else if (inn) {
        amount = inn;
        direction = 'in';
      }
    } else if (map.amount !== undefined) {
      const raw = r[map.amount] ?? '';
      amount = parseMoney(raw);
      const flag = (map.drCr !== undefined ? r[map.drCr] : raw) ?? '';
      direction = /\bcr\b|credit/i.test(flag) || (/^\s*\+/.test(raw)) ? 'in' : /\bdr\b|debit/i.test(flag) || /^\s*-/.test(raw) ? 'out' : 'out';
    }
    if (!date || !amount) {
      skipped++;
      continue;
    }
    rows.push(draft(date, desc, amount, direction));
  }
  return { rows, skipped };
}

/**
 * Lines of statement text (from a PDF or pasted): a line that starts with a
 * date and contains an amount is a transaction. With two or more amounts the
 * last is usually the running balance, so the one before it is used. "Cr"
 * marks money in; otherwise words decide (salary, refund, received).
 */
export function textToRows(text: string): { rows: ImportRow[]; skipped: number } {
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const date = parseStatementDate(line);
    if (!date) continue;
    const amounts = [...line.matchAll(/(?<![\w/-])-?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})|(?<![\w/-])-?\d+\.\d{2}\b/g)].map((m) => ({ s: m[0], i: m.index! }));
    if (!amounts.length) {
      skipped++;
      continue;
    }
    const pick = amounts.length >= 2 ? amounts[amounts.length - 2]! : amounts[0]!;
    const rupees = parseMoney(pick.s);
    if (!rupees) {
      skipped++;
      continue;
    }
    const after = line.slice(pick.i + pick.s.length, pick.i + pick.s.length + 5);
    const dateText = /^\S+(\s+[a-z]{3,9}\s+\d{2,4})?/i.exec(line)![0];
    const desc = line.slice(dateText.length, amounts[0]!.i).replace(/^\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\s*/, '');
    const direction = /^\s*cr\b/i.test(after) || /\bcr\s*$/i.test(line.slice(0, pick.i)) ? 'in' : /^\s*dr\b/i.test(after) ? 'out' : classify(desc).type === 'income' ? 'in' : 'out';
    rows.push(draft(date, desc || 'Statement entry', rupees, direction));
  }
  return { rows, skipped };
}

// --- duplicates ------------------------------------------------------------------------
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
export const dupKey = (t: Pick<TxDraft, 'date' | 'amount' | 'description'>) => `${t.date}|${t.amount}|${norm(t.description)}`;

/**
 * Marks rows that match a saved entry (same date and amount, and the same
 * description or, for typed entries, any description) or an earlier row in
 * this import.
 */
export function markDuplicates(rows: ImportRow[], existing: Transaction[]): boolean[] {
  const saved = new Set(existing.map(dupKey));
  const loose = new Set(existing.filter((t) => t.source !== 'import').map((t) => `${t.date}|${t.amount}`));
  const seen = new Set<string>();
  return rows.map((r) => {
    const k = dupKey(r);
    const dup = saved.has(k) || loose.has(`${r.date}|${r.amount}`) || seen.has(k);
    seen.add(k);
    return dup;
  });
}
