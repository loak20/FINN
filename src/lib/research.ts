import type {
  AuditBlock,
  CashBadge,
  CashQuality,
  DataSource,
  PullResearchReport,
  QuarterSeries,
  ScreenerData,
  SnapshotMetric,
  SourceLink,
  ThesisPoint,
  TrajectoryPoint,
} from '@/types/finn';
import { fiscalQuarter, fiscalYear, fmtCr, fmtPct, pctChange } from './format';
import { hasGemini } from './llm';
import { EBITDA, OPM, PAT, REVENUE, annualIdx, at, cagr, row, sum, ttmIdx } from './tables';

// Deterministic (Tier 0) research modules computed straight from the scraped statements.
// Everything here works with no API key; the narrative audit is layered on top later.

function ratioNum(top: Record<string, string>, ...keys: string[]): number | null {
  for (const key of keys) {
    const k = Object.keys(top).find((x) => x.toLowerCase() === key.toLowerCase());
    if (!k) continue;
    const m = top[k].replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (m) return Number(m[0]);
  }
  return null;
}

function growthPct(d: ScreenerData, table: string, period: string): number | null {
  const v = d.growth[table]?.[period];
  if (!v) return null;
  const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function signedPp(n: number): string {
  return `${n > -0.05 ? '+' : '−'}${Math.abs(n).toFixed(1)}pp`;
}

function opmAt(d: ScreenerData, i: number | undefined): number | null {
  const pl = d.profitLoss;
  const direct = at(row(pl, ...OPM), i);
  if (direct !== null) return direct;
  const rev = at(row(pl, ...REVENUE), i);
  const op = at(row(pl, ...EBITDA), i);
  return rev && op !== null ? (op / rev) * 100 : null;
}

/**
 * Headline margin, computed rather than read (Screener rounds OPM to whole percent).
 * Operating companies: EBITDA margin. Lenders: net margin (PAT / revenue), because Screener's
 * "Financing Profit" is struck after provisions and is often negative for banks.
 */
function exactOpm(d: ScreenerData, i: number | undefined): number | null {
  const pl = d.profitLoss;
  const rev = at(row(pl, ...REVENUE), i);
  const num = at(row(pl, ...(d.isFinancial ? PAT : EBITDA)), i);
  if (rev && num !== null) return (num / rev) * 100;
  return d.isFinancial ? null : opmAt(d, i);
}

export function marginLabel(d: Pick<ScreenerData, 'isFinancial'>): string {
  return d.isFinancial ? 'Net Margin' : 'EBITDA Margin';
}

interface Derived {
  revTtm: number | null;
  patTtm: number | null;
  revGrowthFy: number | null;
  patGrowthFy: number | null;
  marginTtm: number | null;
  margin3yAgo: number | null;
  margin3yLabel: string;
  roe: number | null;
  roce: number | null;
  de: number | null;
  borrowings: number | null;
  wcDays: number | null;
  wcDays3yAgo: number | null;
  wcLabel: string;
  salesCagr3: number | null;
  salesCagr5: number | null;
  profitCagr3: number | null;
  profitCagr5: number | null;
  pe: number | null;
  latestQ: { label: string; revYoy: number | null; patYoy: number | null; opm: number | null; pat: number | null; prevPat: number | null } | null;
  otherIncomeShare: number | null;
  otherIncome: number | null;
  de3yAgo: number | null;
}

function derive(d: ScreenerData): Derived {
  const pl = d.profitLoss;
  const ann = annualIdx(pl);
  const ttm = ttmIdx(pl);
  const lastFy = ann[ann.length - 1];
  const prevFy = ann[ann.length - 2];
  const fy3 = ann[ann.length - 4];
  const rev = row(pl, ...REVENUE);
  const pat = row(pl, ...PAT);

  const bs = d.balanceSheet;
  const bsLast = bs.headers.length - 1;
  const borrowings = at(row(bs, 'Borrowings', 'Borrowing'), bsLast);
  const equity = (at(row(bs, 'Equity Capital'), bsLast) ?? 0) + (at(row(bs, 'Reserves'), bsLast) ?? 0);

  const wc = row(d.ratios, 'Working Capital Days');
  const wcLast = d.ratios.headers.length - 1;

  const ratiosRoce = row(d.ratios, 'ROCE %', 'ROE %');
  const q = d.quarters;
  const qRev = row(q, ...REVENUE);
  const qPat = row(q, ...PAT);
  const qOp = row(q, ...EBITDA);
  let qi = -1;
  if (qRev) for (let i = qRev.length - 1; i >= 0; i--) if (qRev[i] !== null) { qi = i; break; }

  const salesCagr3 = growthPct(d, 'Compounded Sales Growth', '3 Years') ?? cagr(at(rev, lastFy), at(rev, fy3), 3);
  const salesCagr5 = growthPct(d, 'Compounded Sales Growth', '5 Years') ?? cagr(at(rev, lastFy), at(rev, ann[ann.length - 6]), 5);
  const profitCagr3 = growthPct(d, 'Compounded Profit Growth', '3 Years') ?? cagr(at(pat, lastFy), at(pat, fy3), 3);
  const profitCagr5 = growthPct(d, 'Compounded Profit Growth', '5 Years') ?? cagr(at(pat, lastFy), at(pat, ann[ann.length - 6]), 5);

  return {
    revTtm: at(rev, ttm ?? lastFy),
    patTtm: at(pat, ttm ?? lastFy),
    revGrowthFy: pctChange(at(rev, lastFy), at(rev, prevFy)),
    patGrowthFy: pctChange(at(pat, lastFy), at(pat, prevFy)),
    marginTtm: exactOpm(d, ttm ?? lastFy),
    margin3yAgo: exactOpm(d, fy3),
    margin3yLabel: fy3 !== undefined ? fiscalYear(pl.headers[fy3]) : '',
    roe: ratioNum(d.topRatios, 'ROE'),
    roce: ratioNum(d.topRatios, 'ROCE') ?? at(ratiosRoce, d.ratios.headers.length - 1),
    de: borrowings !== null && equity > 0 ? borrowings / equity : null,
    borrowings,
    wcDays: at(wc, wcLast),
    wcDays3yAgo: at(wc, wcLast - 3),
    wcLabel: wcLast - 3 >= 0 ? fiscalYear(d.ratios.headers[wcLast - 3] ?? '') : '',
    salesCagr3,
    salesCagr5,
    profitCagr3,
    profitCagr5,
    pe: ratioNum(d.topRatios, 'Stock P/E'),
    latestQ:
      qi >= 0
        ? {
            label: fiscalQuarter(q.headers[qi]),
            revYoy: pctChange(at(qRev, qi), at(qRev, qi - 4)),
            patYoy: pctChange(at(qPat, qi), at(qPat, qi - 4)),
            pat: at(qPat, qi),
            prevPat: at(qPat, qi - 1),
            opm: (() => {
              const r = at(qRev, qi);
              const n = at(d.isFinancial ? qPat : qOp, qi);
              return r && n !== null ? (n / r) * 100 : null;
            })(),
          }
        : null,
    otherIncome: at(row(pl, 'Other Income'), ttm ?? lastFy),
    otherIncomeShare: (() => {
      const oi = at(row(pl, 'Other Income'), ttm ?? lastFy);
      const pbt = at(row(pl, 'Profit before tax'), ttm ?? lastFy);
      return oi !== null && pbt && pbt > 0 ? (oi / pbt) * 100 : null;
    })(),
    de3yAgo: (() => {
      const i = bsLast - 3;
      if (i < 0) return null;
      const b = at(row(bs, 'Borrowings', 'Borrowing'), i);
      const e = (at(row(bs, 'Equity Capital'), i) ?? 0) + (at(row(bs, 'Reserves'), i) ?? 0);
      return b !== null && e > 0 ? b / e : null;
    })(),
  };
}

function toneOf(n: number | null, good: number, bad: number, higherIsBetter = true): SnapshotMetric['tone'] {
  if (n === null) return 'neutral';
  if (higherIsBetter) return n >= good ? 'pos' : n < bad ? 'neg' : 'neutral';
  return n <= good ? 'pos' : n > bad ? 'neg' : 'neutral';
}

function snapshotMetrics(d: ScreenerData, x: Derived): SnapshotMetric[] {
  const fin = d.isFinancial;
  const marginDelta = x.marginTtm !== null && x.margin3yAgo !== null ? x.marginTtm - x.margin3yAgo : null;
  const wcDelta = x.wcDays !== null && x.wcDays3yAgo !== null ? x.wcDays - x.wcDays3yAgo : null;

  return [
    {
      key: 'revenue',
      label: 'Revenue (TTM)',
      value: fmtCr(x.revTtm),
      sub: x.revGrowthFy !== null ? `${fmtPct(x.revGrowthFy)} last FY` : undefined,
      tone: toneOf(x.revGrowthFy, 10, 0),
      term: 'Revenue',
    },
    {
      key: 'margin',
      label: marginLabel(d),
      value: x.marginTtm !== null ? `${x.marginTtm.toFixed(1)}%` : '—',
      sub: marginDelta !== null ? `${signedPp(marginDelta)} vs ${x.margin3yLabel}` : undefined,
      tone: marginDelta === null ? 'neutral' : marginDelta >= 1 ? 'pos' : marginDelta <= -1 ? 'neg' : 'neutral',
      term: 'Margin',
    },
    {
      key: 'pat',
      label: 'PAT (TTM)',
      value: fmtCr(x.patTtm),
      sub: x.patGrowthFy !== null ? `${fmtPct(x.patGrowthFy)} last FY` : undefined,
      tone: toneOf(x.patGrowthFy, 10, 0),
      term: 'PAT',
    },
    {
      key: 'roe',
      label: 'ROE',
      value: x.roe !== null ? `${x.roe.toFixed(1)}%` : '—',
      sub: x.roe === null ? undefined : x.roe >= 18 ? 'High' : x.roe < 10 ? 'Below cost of equity' : 'Moderate',
      tone: toneOf(x.roe, 18, 10),
      term: 'ROCE / ROE',
    },
    {
      key: 'roce',
      label: 'ROCE',
      value: x.roce !== null ? `${x.roce.toFixed(1)}%` : '—',
      sub: fin ? 'Less useful for lenders' : x.roce === null ? undefined : x.roce >= 20 ? 'High' : x.roce < 10 ? 'Low' : 'Moderate',
      tone: fin ? 'neutral' : toneOf(x.roce, 20, 10),
      term: 'ROCE / ROE',
    },
    fin
      ? { key: 'de', label: 'Debt / Equity', value: 'n/m', sub: 'Lender: borrowing is raw material', tone: 'neutral', term: 'Debt-to-Equity (D/E)' }
      : {
          key: 'de',
          label: 'Debt / Equity',
          value: x.de !== null ? `${x.de.toFixed(2)}×` : '—',
          sub: x.borrowings !== null ? `Borrowings ${fmtCr(x.borrowings)}` : undefined,
          tone: toneOf(x.de, 0.5, 1, false),
          term: 'Debt-to-Equity (D/E)',
        },
    fin
      ? { key: 'wc', label: 'Working Capital', value: 'n/m', sub: 'Not reported for lenders', tone: 'neutral', term: 'Working-capital cycle' }
      : {
          key: 'wc',
          label: 'Working Capital',
          value: x.wcDays !== null ? `${Math.round(x.wcDays)} days` : '—',
          sub: wcDelta !== null ? `${wcDelta >= 0 ? '+' : '−'}${Math.abs(Math.round(wcDelta))}d vs ${x.wcLabel}` : undefined,
          tone: wcDelta === null ? 'neutral' : wcDelta > 15 ? 'warn' : wcDelta < -10 ? 'pos' : 'neutral',
          term: 'Working-capital cycle',
        },
    {
      key: 'trajectory',
      label: '5Y CAGR Sales / PAT',
      value: `${x.salesCagr5 !== null ? `${Math.round(x.salesCagr5)}%` : '—'} / ${x.profitCagr5 !== null ? `${Math.round(x.profitCagr5)}%` : '—'}`,
      sub: `3Y: ${x.salesCagr3 !== null ? `${Math.round(x.salesCagr3)}%` : '—'} / ${x.profitCagr3 !== null ? `${Math.round(x.profitCagr3)}%` : '—'}`,
      tone: toneOf(x.salesCagr5, 12, 5),
      term: 'Revenue',
    },
  ];
}

function trajectory(d: ScreenerData): { points: TrajectoryPoint[]; note: string } {
  const pl = d.profitLoss;
  const idx = annualIdx(pl).slice(-6);
  const rev = row(pl, ...REVENUE);
  const pat = row(pl, ...PAT);
  const points = idx.map((i) => ({
    period: fiscalYear(pl.headers[i]),
    revenue: at(rev, i),
    pat: at(pat, i),
    opm: exactOpm(d, i),
  }));

  const first = points.find((p) => p.revenue !== null);
  const last = [...points].reverse().find((p) => p.revenue !== null);
  if (!first || !last || first === last) return { points, note: 'Not enough annual history to judge direction.' };

  const years = points.indexOf(last) - points.indexOf(first);
  const revCagr = cagr(last.revenue, first.revenue, years);
  const patCagr = cagr(last.pat, first.pat, years);
  const parts: string[] = [];
  if (first.revenue && last.revenue) {
    parts.push(`Revenue ${(last.revenue / first.revenue).toFixed(1)}× over ${first.period}–${last.period}${revCagr !== null ? ` (${revCagr.toFixed(0)}% CAGR)` : ''}`);
  }
  if (first.opm !== null && last.opm !== null) {
    const dm = last.opm - first.opm;
    const label = d.isFinancial ? 'net margin' : 'margins';
    parts.push(
      dm >= 2
        ? `${label} expanded ${first.opm.toFixed(0)}% → ${last.opm.toFixed(0)}%`
        : dm <= -2
          ? `${label} compressed ${first.opm.toFixed(0)}% → ${last.opm.toFixed(0)}%`
          : `${label} steady near ${last.opm.toFixed(0)}%`,
    );
  }
  if (patCagr !== null && revCagr !== null) {
    parts.push(
      patCagr - revCagr > 3
        ? `PAT compounding faster (${patCagr.toFixed(0)}% CAGR)`
        : patCagr - revCagr < -3
          ? `PAT lagging sales (${patCagr.toFixed(0)}% CAGR)`
          : `PAT in step (${patCagr.toFixed(0)}% CAGR)`,
    );
  } else if (first.pat !== null && last.pat !== null && first.pat <= 0 && last.pat > 0) {
    parts.push('turned profitable over the period');
  }
  return { points, note: parts.join('; ') + '.' };
}

function quarterSeries(d: ScreenerData): QuarterSeries {
  const q = d.quarters;
  const n = Math.min(8, q.headers.length);
  const start = q.headers.length - n;
  const rev = row(q, ...REVENUE) ?? [];
  const op = row(q, ...EBITDA) ?? [];
  const pat = row(q, ...PAT) ?? [];
  const range = Array.from({ length: n }, (_, k) => start + k);
  return {
    periods: range.map((i) => fiscalQuarter(q.headers[i])),
    revenue: range.map((i) => at(rev, i)),
    opm: range.map((i) => {
      const r = at(rev, i);
      const o = at(d.isFinancial ? pat : op, i);
      return r && o !== null ? Math.round((o / r) * 1000) / 10 : null;
    }),
    pat: range.map((i) => at(pat, i)),
  };
}

function cashQuality(d: ScreenerData): CashQuality {
  const cf = d.cashFlow;
  const pl = d.profitLoss;
  const bs = d.balanceSheet;
  const cfo = row(cf, 'Cash from Operating Activity');
  const fcfRow = row(cf, 'Free Cash Flow');
  const pat = row(pl, ...PAT);
  const dep = row(pl, 'Depreciation');
  const fa = row(bs, 'Fixed Assets');
  const cwip = row(bs, 'CWIP');

  const cols = cf.headers.map((h, i) => ({ h, i })).slice(-5);
  const years = cols.map((c) => fiscalYear(c.h));
  const cfoV = cols.map((c) => at(cfo, c.i));
  const patV = cols.map((c) => at(pat, pl.headers.indexOf(c.h)));

  const fcfV = cols.map((c) => {
    if (fcfRow) return at(fcfRow, c.i);
    // Estimate capex as the change in gross-ish fixed assets: Δ(net block + CWIP) + depreciation.
    const bi = bs.headers.indexOf(c.h);
    const pi = pl.headers.indexOf(c.h);
    const now = (at(fa, bi) ?? 0) + (at(cwip, bi) ?? 0);
    const before = bi > 0 ? (at(fa, bi - 1) ?? 0) + (at(cwip, bi - 1) ?? 0) : null;
    const c0 = at(cfo, c.i);
    if (c0 === null || before === null) return null;
    return Math.round(c0 - (now - before + (at(dep, pi) ?? 0)));
  });

  const sumCfo = sum(cfoV.filter((_, k) => patV[k] !== null));
  const sumPat = sum(patV.filter((_, k) => cfoV[k] !== null));
  const conversion = sumCfo !== null && sumPat !== null && sumPat > 0 ? sumCfo / sumPat : null;
  const fcfCumulative = sum(fcfV);
  const span = years.length ? `${years[0]}–${years[years.length - 1]}` : '';

  let badge: CashBadge;
  let explanation: string;
  if (d.isFinancial) {
    badge = 'Not Meaningful';
    explanation = `For a lender, operating cash flow mostly reflects loan-book growth and deposit flows, so CFO ÷ PAT says little about earnings quality. Cumulative CFO ${span}: ${fmtCr(sumCfo)}.`;
  } else if (conversion === null) {
    badge = 'Not Meaningful';
    explanation =
      sumPat !== null && sumPat <= 0
        ? `Cumulative PAT ${span} is ${fmtCr(sumPat)}, so the ratio is undefined; cumulative CFO was ${fmtCr(sumCfo)}.`
        : 'Cash-flow history is incomplete for this company.';
  } else if (conversion >= 0.9) {
    badge = 'High Conversion';
    explanation = `₹${conversion.toFixed(2)} of operating cash for every ₹1 of reported profit over ${span}. Earnings are backed by cash${fcfCumulative !== null ? `; free cash after capex ${fmtCr(fcfCumulative)}` : ''}.`;
  } else if (conversion >= 0.6) {
    badge = 'Watch Working Capital';
    explanation = `Only ₹${conversion.toFixed(2)} of operating cash per ₹1 of profit over ${span}: receivables or inventory are absorbing cash. Check whether working-capital days are rising.`;
  } else {
    badge = 'Red Flag';
    explanation = `Just ₹${conversion.toFixed(2)} of operating cash per ₹1 of profit over ${span}. Persistent profit without matching cash flow needs explaining before anything else.`;
  }

  return { years, cfo: cfoV, pat: patV, fcf: fcfV, conversion, fcfCumulative, badge, explanation };
}

function sources(d: ScreenerData): SourceLink[] {
  const out: SourceLink[] = [{ label: `Screener.in · ${d.basis}`, url: d.url, kind: 'screener' }];
  const lastPdf = [...d.quarterPdfs].reverse().find(Boolean);
  if (lastPdf) {
    const qi = d.quarterPdfs.lastIndexOf(lastPdf);
    out.push({ label: `Results ${fiscalQuarter(d.quarters.headers[qi] ?? '')}`, url: lastPdf, kind: 'filing' });
  }
  const ar = d.annualReports[0];
  if (ar) out.push({ label: `Annual Report ${ar.year}`, url: ar.url, kind: 'annual_report' });
  d.concalls
    .filter((c) => c.transcriptUrl)
    .slice(0, 2)
    .forEach((c) => out.push({ label: `Concall ${c.period}`, url: c.transcriptUrl!, kind: 'transcript' }));
  const deck = d.concalls.find((c) => c.pptUrl);
  if (deck) out.push({ label: `Deck ${deck.period}`, url: deck.pptUrl!, kind: 'presentation' });
  return out;
}

// ---------------------------------------------------------------------------
// Rules-based bull vs. bear: each signal carries its own evidence from the statements.
// ---------------------------------------------------------------------------

interface Signal extends ThesisPoint {
  side: 'bull' | 'bear';
  strength: number;
}

function thesisSignals(d: ScreenerData, x: Derived, cash: CashQuality): Signal[] {
  const s: Signal[] = [];
  const add = (side: Signal['side'], strength: number, point: string, evidence: string) => s.push({ side, strength, point, evidence });
  const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)}%`);

  if (x.salesCagr3 !== null) {
    if (x.salesCagr3 >= 15) add('bull', 3, 'Top line is compounding fast', `Sales CAGR 3Y ${pct(x.salesCagr3)}, 5Y ${pct(x.salesCagr5)} (P&L)`);
    else if (x.salesCagr3 >= 10) add('bull', 2, 'Steady double-digit growth', `Sales CAGR 3Y ${pct(x.salesCagr3)}, 5Y ${pct(x.salesCagr5)} (P&L)`);
    else if (x.salesCagr3 <= 4) add('bear', 3, 'Growth has stalled', `Sales CAGR 3Y only ${pct(x.salesCagr3)} (P&L)`);
    else add('bear', 1, 'Growth is merely mid-single-digit', `Sales CAGR 3Y ${pct(x.salesCagr3)} (P&L)`);
  }
  if (x.latestQ?.revYoy !== null && x.latestQ?.revYoy !== undefined) {
    const g = x.latestQ.revYoy;
    if (g >= 15) add('bull', 2, `Momentum into ${x.latestQ.label}`, `${x.latestQ.label} revenue ${fmtPct(g, { digits: 0 })} YoY (quarterly results)`);
    else if (g < 0) add('bear', 3, `Revenue contracting in ${x.latestQ.label}`, `${x.latestQ.label} revenue ${fmtPct(g, { digits: 0 })} YoY (quarterly results)`);
    else if (g < 5) add('bear', 1.5, `Near-flat ${x.latestQ.label}`, `${x.latestQ.label} revenue only ${fmtPct(g, { digits: 1 })} YoY (quarterly results)`);
  }
  if (x.latestQ?.patYoy !== null && x.latestQ?.patYoy !== undefined && x.latestQ.patYoy <= -15) {
    add('bear', 2, `Earnings fell in ${x.latestQ.label}`, `${x.latestQ.label} PAT ${fmtPct(x.latestQ.patYoy, { digits: 0 })} YoY`);
  }
  if (x.marginTtm !== null && x.margin3yAgo !== null) {
    const dm = x.marginTtm - x.margin3yAgo;
    if (dm >= 2) add('bull', 2, 'Margins are expanding', `${marginLabel(d)} ${x.margin3yAgo.toFixed(1)}% (${x.margin3yLabel}) → ${x.marginTtm.toFixed(1)}% TTM`);
    else if (dm <= -2) add('bear', 3, 'Margins are compressing', `${marginLabel(d)} ${x.margin3yAgo.toFixed(1)}% (${x.margin3yLabel}) → ${x.marginTtm.toFixed(1)}% TTM`);
    else add('bull', 0.5, 'Margins held through the cycle', `${marginLabel(d)} ${x.margin3yAgo.toFixed(1)}% → ${x.marginTtm.toFixed(1)}% over 3 years`);
  }
  if (x.profitCagr3 !== null && x.salesCagr3 !== null) {
    const gap = x.profitCagr3 - x.salesCagr3;
    if (gap >= 5) add('bull', 1.5, 'Operating leverage is showing', `PAT CAGR 3Y ${pct(x.profitCagr3)} vs sales ${pct(x.salesCagr3)}`);
    else if (gap <= -5) add('bear', 2, 'Profit is lagging sales', `PAT CAGR 3Y ${pct(x.profitCagr3)} vs sales ${pct(x.salesCagr3)}`);
  }
  if (d.isFinancial) {
    if (x.roe !== null && x.roe >= 15) add('bull', 2, 'Lender earns well above its cost of equity', `ROE ${x.roe.toFixed(1)}%`);
    else if (x.roe !== null && x.roe < 11) add('bear', 2, 'Returns are thin for a lender', `ROE ${x.roe.toFixed(1)}%`);
  } else {
    if (x.roce !== null && x.roce >= 20) add('bull', 2, 'High return on capital', `ROCE ${x.roce.toFixed(1)}%${x.roe !== null ? `, ROE ${x.roe.toFixed(1)}%` : ''}`);
    else if (x.roce !== null && x.roce < 10) add('bear', 2, 'Sub-par return on capital', `ROCE ${x.roce.toFixed(1)}%`);
    if (x.de !== null && x.de < 0.2) add('bull', 1, 'Balance sheet has headroom', `Debt/Equity ${x.de.toFixed(2)}× (latest balance sheet)`);
    else if (x.de !== null && x.de > 1) add('bear', 2.5, 'Leverage is elevated', `Debt/Equity ${x.de.toFixed(2)}×, borrowings ${fmtCr(x.borrowings)}`);
    if (x.wcDays !== null && x.wcDays3yAgo !== null) {
      const dw = x.wcDays - x.wcDays3yAgo;
      if (dw >= 20) add('bear', 2, 'Working capital is stretching', `Working-capital days ${Math.round(x.wcDays3yAgo)} → ${Math.round(x.wcDays)} (${x.wcLabel} → latest)`);
      else if (dw <= -20) add('bull', 1, 'Working capital is tightening', `Working-capital days ${Math.round(x.wcDays3yAgo)} → ${Math.round(x.wcDays)}`);
    }
  }
  if (!d.isFinancial && cash.conversion !== null) {
    if (cash.conversion >= 1) add('bull', 2, 'Profits are backed by cash', `CFO/PAT ${cash.conversion.toFixed(2)}× over ${cash.years[0]}–${cash.years[cash.years.length - 1]}`);
    else if (cash.conversion < 0.6) add('bear', 3, 'Profits are not converting to cash', `CFO/PAT ${cash.conversion.toFixed(2)}× over ${cash.years[0]}–${cash.years[cash.years.length - 1]}`);
    else if (cash.conversion < 0.85) add('bear', 1.5, 'Cash conversion is middling', `CFO/PAT ${cash.conversion.toFixed(2)}×`);
  }
  if (x.pe !== null && x.pe > 0) {
    const growth = x.profitCagr5 ?? x.profitCagr3;
    if (x.pe >= 60) add('bear', 2, 'Valuation prices in a lot', `P/E ${x.pe.toFixed(0)}× vs 5Y PAT CAGR ${pct(growth)}`);
    else if (x.pe <= 18 && (growth ?? 0) >= 10) add('bull', 1.5, 'Valuation is undemanding for the growth', `P/E ${x.pe.toFixed(0)}× vs 5Y PAT CAGR ${pct(growth)}`);
  }
  if (x.profitCagr5 !== null && x.profitCagr5 >= 15) add('bull', 1, 'Long record of profit compounding', `PAT CAGR 5Y ${pct(x.profitCagr5)}`);
  if (x.profitCagr5 !== null && x.profitCagr5 < 5) add('bear', 1, 'Five years of little profit growth', `PAT CAGR 5Y ${pct(x.profitCagr5)}`);
  if (x.latestQ?.opm !== null && x.latestQ?.opm !== undefined && x.marginTtm !== null && x.latestQ.opm < x.marginTtm - 2) {
    add('bear', 1, `${x.latestQ.label} margin below the TTM run-rate`, `${x.latestQ.label} margin ${x.latestQ.opm.toFixed(1)}% vs TTM ${x.marginTtm.toFixed(1)}%`);
  }

  // Momentum against the company's own history.
  if (x.latestQ?.revYoy !== null && x.latestQ?.revYoy !== undefined && x.salesCagr3 !== null) {
    const gap = x.latestQ.revYoy - x.salesCagr3;
    if (gap <= -10) add('bear', 1.5, 'Growth is decelerating', `${x.latestQ.label} revenue ${fmtPct(x.latestQ.revYoy, { digits: 0 })} YoY vs 3Y CAGR ${pct(x.salesCagr3)}`);
    else if (gap >= 8) add('bull', 1.5, 'Growth is accelerating', `${x.latestQ.label} revenue ${fmtPct(x.latestQ.revYoy, { digits: 0 })} YoY vs 3Y CAGR ${pct(x.salesCagr3)}`);
  }
  if (x.latestQ && x.latestQ.pat !== null && x.latestQ.prevPat && x.latestQ.prevPat > 0) {
    const qoq = ((x.latestQ.pat - x.latestQ.prevPat) / x.latestQ.prevPat) * 100;
    if (qoq <= -8) add('bear', 1, `Sequential profit dip in ${x.latestQ.label}`, `PAT ${fmtCr(x.latestQ.pat)} vs ${fmtCr(x.latestQ.prevPat)} a quarter earlier (${fmtPct(qoq, { digits: 0 })})`);
  }
  if (!d.isFinancial) {
    if (x.otherIncomeShare !== null && x.otherIncomeShare >= 25) {
      add('bear', 1.5, 'Earnings lean on other income', `Other income ${fmtCr(x.otherIncome)} is ${Math.round(x.otherIncomeShare)}% of PBT (TTM)`);
    }
    if (cash.fcfCumulative !== null) {
      const span = `${cash.years[0]}–${cash.years[cash.years.length - 1]}`;
      if (cash.fcfCumulative < 0) add('bear', 2, 'Free cash flow is negative', `Cumulative FCF ${span}: ${fmtCr(cash.fcfCumulative)}`);
      else add('bull', 0.8, 'Self-funding after capex', `Cumulative free cash flow ${span}: ${fmtCr(cash.fcfCumulative)}`);
    }
    if (x.de !== null && x.de3yAgo !== null && x.de - x.de3yAgo >= 0.2) {
      add('bear', 1.5, 'Leverage is creeping up', `Debt/Equity ${x.de3yAgo.toFixed(2)}× → ${x.de.toFixed(2)}× over 3 years`);
    }
    if (x.roce !== null && x.roce >= 10 && x.roce < 14) add('bear', 1, 'Returns on capital are only moderate', `ROCE ${x.roce.toFixed(1)}%`);
    if (x.de !== null && x.de >= 0.3 && x.de <= 1) add('bear', 0.7, 'Carries meaningful debt', `Debt/Equity ${x.de.toFixed(2)}×, borrowings ${fmtCr(x.borrowings)}`);
    const cfoSum = sum(cash.cfo);
    if (cash.fcfCumulative !== null && cash.fcfCumulative > 0 && cfoSum && cfoSum > 0 && cash.fcfCumulative / cfoSum < 0.25) {
      add('bear', 1.2, 'Capex absorbs most operating cash', `Cumulative FCF ${fmtCr(cash.fcfCumulative)} vs CFO ${fmtCr(cfoSum)} (${cash.years[0]}–${cash.years[cash.years.length - 1]})`);
    }
    if (x.salesCagr5 !== null && x.profitCagr5 !== null && x.salesCagr5 - x.profitCagr5 >= 4) {
      add('bear', 1, 'Five-year profit growth trails sales', `PAT CAGR 5Y ${pct(x.profitCagr5)} vs sales ${pct(x.salesCagr5)}`);
    }
    const payout = at(row(d.profitLoss, 'Dividend Payout'), annualIdx(d.profitLoss).at(-1));
    if (payout !== null && payout >= 75) {
      add('bear', 0.8, 'Few places left to reinvest', `Dividend payout ${Math.round(payout)}% of profit (${fiscalYear(d.profitLoss.headers[annualIdx(d.profitLoss).at(-1) ?? 0])})`);
    }
    if (x.wcDays !== null && x.wcDays < 30) add('bull', 0.6, 'Lean working capital', `${Math.round(x.wcDays)} working-capital days (latest)`);
    if (x.wcDays !== null && x.wcDays > 120) add('bear', 1, 'Capital-hungry operations', `${Math.round(x.wcDays)} working-capital days (latest)`);
  }
  return s;
}

export function rulesThesis(d: ScreenerData, cash: CashQuality): { bull: ThesisPoint[]; bear: ThesisPoint[] } {
  const signals = thesisSignals(d, derive(d), cash);
  const pick = (side: Signal['side']) =>
    signals
      .filter((s) => s.side === side)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3)
      .map(({ point, evidence }) => ({ point, evidence }));
  return { bull: pick('bull'), bear: pick('bear') };
}

export function defaultAudit(d: ScreenerData): AuditBlock {
  const seen = new Set<string>();
  const transcripts = d.concalls.filter((c) => c.transcriptUrl && !seen.has(c.period) && seen.add(c.period));
  const used = transcripts.slice(0, 4).map((c) => ({ label: `Concall ${c.period}`, url: c.transcriptUrl!, kind: 'transcript' as const }));
  if (!transcripts.length) {
    return {
      status: 'no-transcripts',
      items: [],
      guidance: [],
      transcriptsUsed: [],
      note: `Screener lists no concall transcripts for ${d.name}. FINN will not invent management commentary; the delivered numbers are shown on their own.`,
    };
  }
  if (!hasGemini()) {
    return {
      status: 'needs-key',
      items: [],
      guidance: [],
      transcriptsUsed: used,
      note: `${used.length} transcripts found. Add GEMINI_API_KEY to run the audit: Flash extracts guidance from each call, then Pro checks it against the numbers.`,
    };
  }
  return { status: 'queued', items: [], guidance: [], transcriptsUsed: used, note: `Reading ${used.length} concall transcripts…` };
}

export function buildCoreReport(d: ScreenerData, source: DataSource): PullResearchReport {
  const x = derive(d);
  const traj = trajectory(d);
  const cash = cashQuality(d);
  const keyPoints = d.keyPoints ? [d.keyPoints.length > 700 ? `${d.keyPoints.slice(0, 700).trim()}…` : d.keyPoints] : [];

  return {
    ticker: d.ticker,
    name: d.name,
    asOf: d.fetchedAt,
    basis: d.basis,
    isFinancial: d.isFinancial,
    price: ratioNum(d.topRatios, 'Current Price') ?? undefined,
    marketCapCr: ratioNum(d.topRatios, 'Market Cap') ?? undefined,
    pe: x.pe ?? undefined,
    sources: sources(d),
    provenance: { financials: source, narrative: 'none' },
    business: { overview: d.about, keyPoints, segments: [] },
    snapshot: snapshotMetrics(d, x),
    trajectory: traj.points,
    trajectoryNote: traj.note,
    quarters: quarterSeries(d),
    cash,
    audit: defaultAudit(d),
    thesis: { ...rulesThesis(d, cash), source: 'rules' },
    stage: 'core',
  };
}

/** Compact, model-friendly view of the statements (also used for scoped Q&A). */
export function compactFinancials(d: ScreenerData): Record<string, unknown> {
  const q = d.quarters;
  const qRev = row(q, ...REVENUE);
  const qOp = row(q, ...EBITDA);
  const qPat = row(q, ...PAT);
  const qStart = Math.max(0, q.headers.length - 9);
  const quarterly = q.headers.slice(qStart).map((h, k) => {
    const i = qStart + k;
    const r = at(qRev, i);
    const o = at(d.isFinancial ? qPat : qOp, i);
    return {
      period: h,
      fiscal: fiscalQuarter(h),
      revenueCr: r,
      revenueYoYPct: round1(pctChange(r, at(qRev, i - 4))),
      revenueQoQPct: round1(pctChange(r, at(qRev, i - 1))),
      marginPct: r && o !== null ? round1((o / r) * 100) : null,
      patCr: at(qPat, i),
      patYoYPct: round1(pctChange(at(qPat, i), at(qPat, i - 4))),
    };
  });

  const pl = d.profitLoss;
  const rev = row(pl, ...REVENUE);
  const pat = row(pl, ...PAT);
  const annual = pl.headers.slice(-5).map((h) => {
    const i = pl.headers.indexOf(h);
    return {
      period: h,
      revenueCr: at(rev, i),
      revenueGrowthPct: round1(pctChange(at(rev, i), at(rev, i - 1))),
      marginPct: round1(exactOpm(d, i)),
      patCr: at(pat, i),
    };
  });

  const cf = d.cashFlow;
  const bs = d.balanceSheet;
  const lastBs = bs.headers.length - 1;
  return {
    company: d.name,
    basis: d.basis,
    unit: 'Rs crore',
    marginBasis: d.isFinancial ? 'net margin (PAT / revenue)' : 'EBITDA margin (operating profit / revenue)',
    quarterly,
    annual,
    balanceSheetLatest: {
      period: bs.headers[lastBs],
      borrowingsCr: at(row(bs, 'Borrowings', 'Borrowing'), lastBs),
      equityCr: (at(row(bs, 'Equity Capital'), lastBs) ?? 0) + (at(row(bs, 'Reserves'), lastBs) ?? 0),
    },
    cashFlow: cf.headers.slice(-5).map((h) => {
      const i = cf.headers.indexOf(h);
      return { period: h, cfoCr: at(row(cf, 'Cash from Operating Activity'), i), fcfCr: at(row(cf, 'Free Cash Flow'), i) };
    }),
    workingCapitalDays: d.ratios.headers.slice(-5).map((h) => ({ period: h, days: at(row(d.ratios, 'Working Capital Days'), d.ratios.headers.indexOf(h)) })),
    topRatios: d.topRatios,
  };
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}
