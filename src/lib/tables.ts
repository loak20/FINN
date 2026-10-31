import type { FinTable } from '@/types/finn';

// Label-tolerant accessors over Screener tables. Screener names rows differently for
// lenders ("Revenue", "Financing Profit") and appends schedule descriptions to some labels.

export function row(table: FinTable, ...labels: string[]): (number | null)[] | undefined {
  const keys = Object.keys(table.rows);
  for (const label of labels) {
    const l = label.toLowerCase();
    const exact = keys.find((k) => k.toLowerCase() === l);
    if (exact) return table.rows[exact];
  }
  for (const label of labels) {
    const l = label.toLowerCase();
    const prefix = keys.find((k) => k.toLowerCase().startsWith(l));
    if (prefix) return table.rows[prefix];
  }
  return undefined;
}

export const REVENUE = ['Sales', 'Revenue'];
export const EBITDA = ['Operating Profit', 'Financing Profit'];
export const OPM = ['OPM %', 'Financing Margin %'];
export const PBT = ['Profit before tax'];
export const PAT = ['Net Profit'];

/** Annual columns only (drops the trailing TTM column). */
export function annualIdx(table: FinTable): number[] {
  return table.headers.map((h, i) => ({ h, i })).filter(({ h }) => !/ttm/i.test(h)).map(({ i }) => i);
}

export function ttmIdx(table: FinTable): number | undefined {
  const i = table.headers.findIndex((h) => /ttm/i.test(h));
  return i >= 0 ? i : undefined;
}

export function at(values: (number | null)[] | undefined, i: number | undefined): number | null {
  if (!values || i === undefined || i < 0 || i >= values.length) return null;
  return values[i] ?? null;
}

export function sum(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

export function cagr(end: number | null, start: number | null, years: number): number | null {
  if (end === null || start === null || start <= 0 || end <= 0 || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 2026" -> Date at month end. */
export function periodEnd(label: string): Date | null {
  const m = label.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
  if (month < 0) return null;
  return new Date(Date.UTC(Number(m[2]), month + 1, 0));
}

export function monthLabel(monthIndex: number, year: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

export { MONTHS };
