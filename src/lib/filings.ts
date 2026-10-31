import { CATEGORY_DEFS } from '@/config/portfolio';
import type {
  CorporateFiling,
  DataSource,
  FilingCategory,
  ResultsMetricRow,
  ResultsTable,
  ScreenerData,
  StockMeta,
  TelemetryEvent,
} from '@/types/finn';
import { hashKey } from './cache';
import { classifyFiling, defaultOneLiner, materialityOf } from './classifier';
import { fiscalQuarter, pctChange } from './format';
import { callGemini, hasGemini } from './llm';
import { EBITDA, PAT, PBT, REVENUE, at, monthLabel, periodEnd, row } from './tables';
import { skippedEvent } from './telemetry';

const DAY = 24 * 60 * 60_000;
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export interface ScoredFiling {
  filing: CorporateFiling;
  confidence: 'high' | 'low';
}

/** "Announcement under Regulation 30 (LODR)-Change in Directorate" -> "Change in Directorate" */
export function tidyTitle(title: string): string {
  return title
    .replace(/^announcement under regulation 30 \(lodr\)\s*-\s*/i, '')
    .replace(/^compliances?\s*-\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Which quarter a results filing is about, as a Screener column label ("Sep 2026"). */
export function detectPeriod(text: string): string | null {
  const t = text.toLowerCase();
  let m = t.match(
    /ended\s+(?:on\s+)?(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s*(?:(\d{1,2})(?:st|nd|rd|th)?)?,?\s*(\d{4})/,
  );
  if (m) return monthLabel(MONTH_NAMES.indexOf(m[2]), Number(m[4]));

  m = t.match(/ended\s+(?:on\s+)?(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return monthLabel(Number(m[2]) - 1, Number(m[3]));

  m = t.match(/\bq([1-4])\s?fy\s?'?(\d{2,4})\b/);
  if (m) {
    const q = Number(m[1]);
    let fy = Number(m[2]);
    if (fy < 100) fy += 2000;
    return monthLabel([5, 8, 11, 2][q - 1], q === 4 ? fy : fy - 1);
  }
  return null;
}

function lastIndexWithValue(values: (number | null)[]): number {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) return i;
  return -1;
}

function signedPp(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}pp`;
}

export function marginTakeaway(rows: ResultsMetricRow[], isFinancial: boolean): string {
  const [rev, ebitda, , pat] = rows;
  const margin = (k: 'current' | 'prevQuarter' | 'yearAgo') => {
    const r = rev[k];
    const e = ebitda[k];
    return r && e !== null ? (e / r) * 100 : null;
  };
  const mc = margin('current');
  const mp = margin('prevQuarter');
  const my = margin('yearAgo');
  const label = isFinancial ? 'Financing margin' : 'EBITDA margin';

  const parts: string[] = [];
  if (mc !== null) {
    const deltas = [my !== null ? `${signedPp(mc - my)} YoY` : null, mp !== null ? `${signedPp(mc - mp)} QoQ` : null].filter(Boolean);
    parts.push(`${label} ${mc.toFixed(1)}%${deltas.length ? ` (${deltas.join(', ')})` : ''}`);
  }
  if (rev.yoyPct !== null && pat.yoyPct !== null) {
    if (rev.yoyPct < 0) parts.push(`revenue shrank ${Math.abs(rev.yoyPct).toFixed(0)}% YoY`);
    else if (pat.yoyPct - rev.yoyPct > 5) parts.push(`PAT ${pat.yoyPct >= 0 ? '+' : ''}${pat.yoyPct.toFixed(0)}% outran revenue +${rev.yoyPct.toFixed(0)}%: operating leverage`);
    else if (rev.yoyPct - pat.yoyPct > 5) parts.push(`PAT ${pat.yoyPct >= 0 ? '+' : ''}${pat.yoyPct.toFixed(0)}% lagged revenue +${rev.yoyPct.toFixed(0)}%: costs, interest or tax absorbed growth`);
    else parts.push(`profit tracked revenue (+${rev.yoyPct.toFixed(0)}% YoY)`);
  }
  return parts.join(' · ');
}

export function buildMetricRows(
  get: (metric: ResultsMetricRow['metric']) => { current: number | null; prev: number | null; yearAgo: number | null },
): ResultsMetricRow[] {
  return (['Revenue', 'EBITDA', 'PBT', 'PAT'] as const).map((metric) => {
    const v = get(metric);
    return {
      metric,
      current: v.current,
      prevQuarter: v.prev,
      yearAgo: v.yearAgo,
      qoqPct: pctChange(v.current, v.prev),
      yoyPct: pctChange(v.current, v.yearAgo),
    };
  });
}

/**
 * Tier 0 results matrix straight from Screener's quarterly table. If the filing is for a
 * quarter Screener has not ingested yet, show the latest available one and flag it stale.
 */
export function buildResultsTable(d: ScreenerData, targetPeriod: string | null, filedAt?: string): ResultsTable | undefined {
  const q = d.quarters;
  const rev = row(q, ...REVENUE);
  const pat = row(q, ...PAT);
  if (!rev || !pat) return undefined;
  const series: Record<ResultsMetricRow['metric'], (number | null)[] | undefined> = {
    Revenue: rev,
    EBITDA: row(q, ...EBITDA),
    PBT: row(q, ...PBT),
    PAT: pat,
  };

  let idx = targetPeriod ? q.headers.indexOf(targetPeriod) : -1;
  let stale = false;
  let note: string | undefined;
  if (idx < 0) {
    idx = lastIndexWithValue(rev);
    if (idx < 0) return undefined;
    const latest = q.headers[idx];
    if (targetPeriod) {
      stale = true;
      note = `Structured tables not yet updated for ${fiscalQuarter(targetPeriod)}; showing last reported ${fiscalQuarter(latest)}.`;
    } else if (filedAt) {
      const end = periodEnd(latest);
      if (end && Date.parse(filedAt) - end.getTime() > 100 * DAY) {
        stale = true;
        note = `Latest structured quarter is ${fiscalQuarter(latest)}; this filing may be newer.`;
      }
    }
  }
  if (idx < 1) return undefined;

  const rows = buildMetricRows((metric) => {
    const s = series[metric];
    return { current: at(s, idx), prev: at(s, idx - 1), yearAgo: at(s, idx - 4) };
  });

  return {
    period: q.headers[idx],
    prevPeriod: q.headers[idx - 1],
    yearAgoPeriod: q.headers[idx - 4] ?? '—',
    basis: d.basis,
    ebitdaLabel: d.isFinancial ? 'Fin. Profit' : 'EBITDA',
    rows,
    marginTakeaway: marginTakeaway(rows, d.isFinancial),
    source: 'screener',
    stale,
    note,
  };
}

/** Classify a company's recent announcements (last 7 days relative to `nowMs`). */
export function buildFilings(stock: StockMeta, d: ScreenerData, source: DataSource, nowMs: number): ScoredFiling[] {
  const cutoff = nowMs - 7 * DAY;
  return d.announcements
    .filter((a) => {
      const t = Date.parse(a.filedAt);
      return t >= cutoff && t <= nowMs + 60 * 60_000;
    })
    .map((a) => {
      const c = classifyFiling(a.title, a.detail, { isLender: d.isFinancial });
      const filing: CorporateFiling = {
        id: hashKey(`${stock.ticker}|${a.url}|${a.filedAt}`).slice(0, 16),
        ticker: stock.ticker,
        company: stock.name,
        title: tidyTitle(a.title),
        detail: a.detail,
        filedAt: a.filedAt,
        url: a.url,
        category: c.category,
        materiality: materialityOf(c.score),
        score: c.score,
        oneLiner: a.detail || defaultOneLiner(c.category, c.hint),
        classifiedBy: 'rules',
        source,
      };
      if (c.category === 'results' && c.score >= 55) {
        filing.results = buildResultsTable(d, detectPeriod(`${a.title} ${a.detail}`), a.filedAt);
      }
      return { filing, confidence: c.confidence };
    });
}

const CLUSTERABLE = new Set<FilingCategory>(['results', 'management_change', 'M&A', 'fund_raise', 'litigation', 'capex', 'credit_rating', 'earnings_call']);
const CLUSTER_WINDOW = 18 * 60 * 60_000;

/**
 * Noise cancelling: the same event usually arrives as 3-5 filings (board outcome, results,
 * deck, press release). Fold them into the highest-scoring one. Exact duplicates are dropped.
 */
export function clusterFilings(filings: CorporateFiling[]): CorporateFiling[] {
  const sorted = [...filings].sort((a, b) => b.score - a.score || Date.parse(b.filedAt) - Date.parse(a.filedAt));
  const out: CorporateFiling[] = [];
  const seen = new Set<string>();

  for (const f of sorted) {
    const dupKey = `${f.ticker}|${f.title.toLowerCase()}|${f.filedAt.slice(0, 13)}`;
    if (seen.has(dupKey)) continue;
    seen.add(dupKey);

    if (f.materiality !== 'routine' && CLUSTERABLE.has(f.category)) {
      const parent = out.find(
        (p) =>
          p.ticker === f.ticker &&
          p.category === f.category &&
          p.materiality !== 'routine' &&
          Math.abs(Date.parse(p.filedAt) - Date.parse(f.filedAt)) < CLUSTER_WINDOW,
      );
      if (parent) {
        parent.related = [...(parent.related ?? []), { title: f.title, filedAt: f.filedAt, url: f.url }];
        if (!parent.results && f.results) parent.results = f.results;
        if (!parent.bio && f.bio) parent.bio = f.bio;
        continue;
      }
    }
    out.push({ ...f });
  }

  // An event with a fresh results matrix is always worth a look, even when the best surviving
  // filing in the window is the deck rather than the results document itself.
  for (const f of out) {
    if (f.category === 'results' && f.results && !f.results.stale && f.score < 85) {
      f.score = 85;
      f.materiality = materialityOf(85);
    }
  }
  return out;
}

interface FlashClassification {
  items: { id: string; category: FilingCategory; score: number; oneLiner: string }[];
}

const CATEGORY_KEYS = Object.keys(CATEGORY_DEFS) as FilingCategory[];

/**
 * Tier 1: only filings the rules engine marked low-confidence go to Flash, batched 25 per call.
 * Mutates the filings in place and returns telemetry.
 */
export async function refineWithFlash(scored: ScoredFiling[], route: string): Promise<TelemetryEvent[]> {
  const ambiguous = scored.filter((s) => s.confidence === 'low').map((s) => s.filing);
  if (!ambiguous.length) return [];
  if (!hasGemini()) {
    return [skippedEvent(route, `Classify ${ambiguous.length} ambiguous filings`, 1, 'gemini-flash', 'No GEMINI_API_KEY: kept rules-engine labels')];
  }

  const events: TelemetryEvent[] = [];
  const system = [
    'You classify Indian stock-exchange (NSE/BSE) corporate announcements for a portfolio manager.',
    `Pick exactly one category: ${CATEGORY_KEYS.join(', ')}.`,
    'Category definitions:',
    ...CATEGORY_KEYS.map((k) => `- ${k}: ${CATEGORY_DEFS[k].definition}`),
    'score = 0-100 materiality to an equity investor (routine compliance < 20; results/M&A/CEO-CFO change/warning letters > 80).',
    'oneLiner = at most 18 words, factual, from the given text only, no adjectives like "significant".',
    'Return JSON: {"items":[{"id":"...","category":"...","score":0,"oneLiner":"..."}]}',
  ].join('\n');

  for (let i = 0; i < ambiguous.length; i += 25) {
    const batch = ambiguous.slice(i, i + 25);
    try {
      const r = await callGemini<FlashClassification>({
        tier: 1,
        route,
        task: `Classify ${batch.length} ambiguous filings`,
        system,
        parts: [{ text: JSON.stringify(batch.map((f) => ({ id: f.id, ticker: f.ticker, title: f.title, detail: f.detail.slice(0, 400) }))) }],
        timeoutMs: 15_000,
      });
      events.push(r.event);
      for (const item of r.data.items ?? []) {
        const f = batch.find((x) => x.id === item.id);
        if (!f || !CATEGORY_KEYS.includes(item.category)) continue;
        const score = Math.max(0, Math.min(100, Math.round(Number(item.score) || 0)));
        f.category = item.category;
        f.score = score;
        f.materiality = materialityOf(score);
        if (item.oneLiner) f.oneLiner = String(item.oneLiner).slice(0, 200);
        f.classifiedBy = 'flash';
      }
    } catch (e) {
      events.push(skippedEvent(route, `Classify ${batch.length} ambiguous filings`, 1, 'gemini-flash', `Flash failed (${(e as Error).message.slice(0, 80)}); kept rules labels`));
    }
  }
  return events;
}
