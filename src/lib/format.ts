// Number and time formatting shared by server and client. Indian conventions:
// money in ₹ crore, grouped en-IN (1,23,456), very large values in lakh crore.

const IN = 'en-IN';

export function fmtCr(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (opts.compact !== false && abs >= 100_000) {
    return `₹${(n / 100_000).toLocaleString(IN, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}L Cr`;
  }
  const digits = abs >= 100 ? 0 : 1;
  return `₹${n.toLocaleString(IN, { maximumFractionDigits: digits, minimumFractionDigits: digits })} Cr`;
}

/** Bare crore number without the unit, for dense tables. */
export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString(IN, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtPct(n: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const { digits = 1, sign = true } = opts;
  const s = n.toFixed(digits);
  return `${sign && n > 0 ? '+' : ''}${s}%`;
}

export function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString(IN, { maximumFractionDigits: 2, minimumFractionDigits: n < 1000 ? 2 : 0 })}`;
}

export function fmtVolume(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

export function fmtMultiple(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}×`;
}

export function fmtUsd(n: number): string {
  if (n === 0) return '$0.0000';
  if (n < 0.0001) return '<$0.0001';
  return `$${n.toFixed(4)}`;
}

export function pctChange(curr: number | null | undefined, base: number | null | undefined): number | null {
  if (curr === null || curr === undefined || base === null || base === undefined) return null;
  if (!Number.isFinite(curr) || !Number.isFinite(base) || base === 0) return null;
  return ((curr - base) / Math.abs(base)) * 100;
}

export function timeAgo(iso: string, nowIso?: string): string {
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(IN, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(IN, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** "Sep 2026" -> "Q2 FY27" (Indian fiscal year ends in March). */
export function fiscalQuarter(label: string): string {
  const m = label.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})$/i);
  if (!m) return label;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase());
  const year = Number(m[2]);
  const fyEnd = month >= 3 ? year + 1 : year;
  const q = month >= 3 ? Math.floor((month - 3) / 3) + 1 : 4;
  return `Q${q} FY${String(fyEnd).slice(-2)}`;
}

/** "Mar 2026" -> "FY26" */
export function fiscalYear(label: string): string {
  const m = label.match(/(\d{4})/);
  if (!m) return label;
  if (/^TTM/i.test(label)) return 'TTM';
  return `FY${m[1].slice(-2)}`;
}
