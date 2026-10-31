import type { EnrichRequest, ExecutiveBio, ResultsTable, TelemetryEvent } from '@/types/finn';
import { buildMetricRows, detectPeriod, marginTakeaway } from './filings';
import { fetchBuffer } from './http';
import { callGemini, hasGemini } from './llm';

// On-demand Tier 1 enrichment from the filing PDF itself. Runs only when the investor taps
// "extract", so a quiet day costs nothing and a busy one costs cents.

type Filing = EnrichRequest['filing'];

async function filingPdf(url: string | undefined): Promise<string> {
  if (!url) throw new Error('This filing has no attachment link');
  const { buf, contentType } = await fetchBuffer(url, { timeoutMs: 25_000, maxBytes: 15 * 1024 * 1024, headers: { Accept: 'application/pdf' } });
  if (!/pdf/i.test(contentType) && buf.subarray(0, 4).toString() !== '%PDF') throw new Error('Attachment is not a PDF');
  return buf.toString('base64');
}

interface ResultsExtract {
  period?: string;
  prevPeriod?: string;
  yearAgoPeriod?: string;
  basis?: 'Consolidated' | 'Standalone';
  isLender?: boolean;
  rows?: { metric: 'Revenue' | 'EBITDA' | 'PBT' | 'PAT'; current: number | null; prevQuarter: number | null; yearAgo: number | null }[];
}

const RESULTS_SYSTEM = [
  "You extract headline numbers from an Indian listed company's quarterly results filing (the PDF provided).",
  'Use ONLY the document. Prefer consolidated figures if present, else standalone.',
  'Return values in Rs crore (convert from lakhs or millions; 1 crore = 100 lakhs = 10 million).',
  'Revenue = Revenue from operations. PBT = profit before tax (after exceptional items). PAT = net profit for the period.',
  'EBITDA = PBT + finance costs + depreciation & amortisation - other income (compute it if not stated).',
  'Columns: current quarter, immediately preceding quarter, and same quarter of the previous year. Use null if absent.',
  'Return JSON: {"period":"Sep 2026","prevPeriod":"Jun 2026","yearAgoPeriod":"Sep 2025","basis":"Consolidated","isLender":false,',
  '"rows":[{"metric":"Revenue","current":0,"prevQuarter":0,"yearAgo":0},{"metric":"EBITDA",...},{"metric":"PBT",...},{"metric":"PAT",...}]}',
].join('\n');

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : Math.round(n * 100) / 100;
}

export async function extractResults(filing: Filing, route: string): Promise<{ results: ResultsTable; events: TelemetryEvent[] }> {
  if (!hasGemini()) throw new Error('Add GEMINI_API_KEY to extract numbers from filing PDFs');
  const pdf = await filingPdf(filing.url);
  const r = await callGemini<ResultsExtract>({
    tier: 1,
    route,
    task: `${filing.ticker}: results headline extraction from filing PDF`,
    system: RESULTS_SYSTEM,
    parts: [{ inlineData: { mimeType: 'application/pdf', data: pdf } }, { text: `Company ticker: ${filing.ticker}. Filing subject: ${filing.title}` }],
    cacheKey: `results-pdf:v1:${filing.url}`,
    timeoutMs: 30_000,
  });

  const x = r.data;
  const byMetric = new Map((x.rows ?? []).map((row) => [row.metric, row]));
  // Percentages are recomputed here: arithmetic stays deterministic, never trusted to the model.
  const rows = buildMetricRows((metric) => {
    const m = byMetric.get(metric);
    return { current: num(m?.current), prev: num(m?.prevQuarter), yearAgo: num(m?.yearAgo) };
  });
  if (rows.every((row) => row.current === null)) throw new Error('No headline numbers found in the filing');

  const period = x.period || detectPeriod(`${filing.title} ${filing.detail}`) || 'Latest quarter';
  return {
    results: {
      period,
      prevPeriod: x.prevPeriod || 'Prev qtr',
      yearAgoPeriod: x.yearAgoPeriod || 'Year ago',
      basis: x.basis === 'Standalone' ? 'Standalone' : 'Consolidated',
      ebitdaLabel: x.isLender ? 'Fin. Profit' : 'EBITDA',
      rows,
      marginTakeaway: marginTakeaway(rows, Boolean(x.isLender)),
      source: 'filing-llm',
    },
    events: [r.event],
  };
}

const BIO_SYSTEM = [
  'You read a Regulation 30 (SEBI LODR) disclosure about a change in directors or key managerial personnel.',
  'Identify the most senior person being appointed (prefer incoming over outgoing) and summarise their background',
  "using ONLY the document's brief-profile / annexure text. Do not add outside knowledge.",
  'Return JSON: {"person":"","role":"","change":"appointed|resigned|retired|redesignated|other","effective":"",',
  '"summary":"two factual sentences","career":["Role, Organisation (years)"],"education":""}',
  'career: up to 5 entries, most recent first. Use empty strings/arrays when the document does not say.',
].join('\n');

export async function extractBio(filing: Filing, route: string): Promise<{ bio: ExecutiveBio; events: TelemetryEvent[] }> {
  if (!hasGemini()) throw new Error('Add GEMINI_API_KEY to extract executive bios from filings');
  const pdf = await filingPdf(filing.url);
  const r = await callGemini<Partial<ExecutiveBio>>({
    tier: 1,
    route,
    task: `${filing.ticker}: executive bio from appointment annexure`,
    system: BIO_SYSTEM,
    parts: [{ inlineData: { mimeType: 'application/pdf', data: pdf } }, { text: `Company ticker: ${filing.ticker}. Subject: ${filing.title}. Exchange summary: ${filing.detail}` }],
    cacheKey: `bio-pdf:v1:${filing.url}`,
    timeoutMs: 30_000,
  });

  const b = r.data;
  if (!b.person) throw new Error('No named person found in the filing');
  const change = ['appointed', 'resigned', 'retired', 'redesignated', 'other'].includes(String(b.change)) ? (b.change as ExecutiveBio['change']) : 'other';
  return {
    bio: {
      person: String(b.person),
      role: String(b.role ?? ''),
      change,
      effective: b.effective ? String(b.effective) : undefined,
      summary: String(b.summary ?? ''),
      career: Array.isArray(b.career) ? b.career.map(String).slice(0, 5) : [],
      education: b.education ? String(b.education) : undefined,
      source: 'llm',
    },
    events: [r.event],
  };
}
