import { NextResponse, type NextRequest } from 'next/server';
import { ADHOC, normaliseTicker } from '@/config/portfolio';
import { SEED_NARRATIVES, seedScreener } from '@/data/seed_data';
import { TTL, cacheGet, cacheSet } from '@/lib/cache';
import { hasGemini } from '@/lib/llm';
import { runNarrativeAudit } from '@/lib/narrative';
import { answerQuestion } from '@/lib/qa';
import { buildCoreReport, defaultAudit } from '@/lib/research';
import { TickerNotFoundError, getScreenerData } from '@/lib/screenerScraper';
import { tier0Event } from '@/lib/telemetry';
import type { AskResponse, DataSource, PullResearchReport, ResearchResponse, ScreenerData, TelemetryEvent } from '@/types/finn';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/research';
const SUGGESTIONS = [...ADHOC.map((s) => s.ticker), 'TRENT', 'INFY'];

type Params = { params: Promise<{ ticker: string }> };

interface Loaded {
  data?: ScreenerData;
  source?: DataSource;
  error?: string;
}

async function load(ticker: string, seedOnly: boolean): Promise<Loaded> {
  let error = 'Screener.in is unreachable and there is no offline snapshot for this ticker.';
  if (!seedOnly) {
    try {
      const { data, source } = await getScreenerData(ticker);
      return { data, source };
    } catch (e) {
      if (e instanceof TickerNotFoundError) error = `No NSE company found for "${ticker}" on Screener.in. Check the symbol (e.g. ITC, BEL, IRCTC).`;
    }
  }
  const seed = seedScreener(ticker);
  if (seed) return { data: seed, source: 'seed' };
  return { error: seedOnly ? `No offline snapshot for ${ticker}. Switch data source to Auto to scrape it live.` : error };
}

function applySeedNarrative(report: PullResearchReport, note?: string): boolean {
  const seed = SEED_NARRATIVES[report.ticker];
  if (!seed) return false;
  report.audit = { ...seed.audit, note: note ?? seed.audit.note };
  report.thesis = { ...seed.thesis, source: 'seed' };
  if (seed.segments.length) report.business.segments = seed.segments;
  report.provenance.narrative = 'seed';
  return true;
}

export async function GET(req: NextRequest, { params }: Params) {
  const started = Date.now();
  const { ticker: rawTicker } = await params;
  const ticker = normaliseTicker(decodeURIComponent(rawTicker));
  const sp = req.nextUrl.searchParams;
  const stage = sp.get('stage') === 'deep' ? 'deep' : 'core';
  const seedOnly = sp.get('source') === 'seed';
  const telemetry: TelemetryEvent[] = [];

  if (!ticker) {
    return NextResponse.json({ ok: false, ticker: '', error: 'Enter an NSE ticker.', suggestions: SUGGESTIONS, telemetry } satisfies ResearchResponse);
  }

  const { data, source, error } = await load(ticker, seedOnly);
  if (!data || !source) {
    return NextResponse.json({ ok: false, ticker, error: error ?? 'Unavailable', suggestions: SUGGESTIONS, telemetry } satisfies ResearchResponse);
  }
  if (sp.get('raw') === '1') return NextResponse.json(data);

  telemetry.push(tier0Event(ROUTE, `${ticker}: Screener scrape + statement parsing (cheerio)`, started, { cacheHit: source !== 'live', note: source }));
  const t1 = Date.now();
  const report = buildCoreReport(data, source);
  telemetry.push(tier0Event(ROUTE, `${ticker}: ratios, cash conversion, rules bull/bear`, t1));

  if (stage === 'core') {
    if (!hasGemini() || seedOnly) applySeedNarrative(report);
    return NextResponse.json({ ok: true, report, telemetry } satisfies ResearchResponse);
  }

  report.stage = 'deep';
  const cachedDeep = !seedOnly ? await cacheGet<PullResearchReport>(`research:deep:${ticker}`) : undefined;
  if (cachedDeep && cachedDeep.audit.status === 'complete') {
    report.audit = cachedDeep.audit;
    report.thesis = cachedDeep.thesis;
    report.business.segments = cachedDeep.business.segments;
    report.provenance = { ...report.provenance, narrative: 'cache', narrativeModel: cachedDeep.provenance.narrativeModel };
    telemetry.push(tier0Event(ROUTE, `${ticker}: narrative audit served from cache`, Date.now(), { cacheHit: true }));
  } else if (hasGemini() && !seedOnly && report.audit.status !== 'no-transcripts') {
    const n = await runNarrativeAudit(data, ROUTE, started + 55_000);
    telemetry.push(...n.events);
    if (n.audit.status === 'complete') {
      report.audit = n.audit;
      if (n.thesis) report.thesis = { ...n.thesis, source: 'llm' };
      if (n.segments?.length) report.business.segments = n.segments;
      report.provenance.narrative = 'live';
      report.provenance.narrativeModel = n.model;
      await cacheSet(`research:deep:${ticker}`, report, TTL.research);
    } else if (!applySeedNarrative(report, `Live audit unavailable: ${n.audit.note ?? 'unknown error'} Showing the pre-computed audit.`)) {
      report.audit = n.audit;
    }
  } else if (!applySeedNarrative(report) && seedOnly) {
    const base = defaultAudit(data);
    report.audit = {
      ...base,
      status: base.status === 'no-transcripts' ? 'no-transcripts' : 'needs-key',
      note: base.status === 'no-transcripts' ? base.note : 'Demo-seed mode: the live transcript audit is off. Switch the data source to Auto in the router drawer.',
    };
  }

  return NextResponse.json({ ok: true, report, telemetry } satisfies ResearchResponse);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { ticker: rawTicker } = await params;
  const ticker = normaliseTicker(decodeURIComponent(rawTicker));
  let question = '';
  let seedOnly = false;
  try {
    const body = (await req.json()) as { question?: string; source?: string };
    question = String(body.question ?? '').trim();
    seedOnly = body.source === 'seed';
  } catch {
    // fall through to validation
  }
  if (!question) {
    return NextResponse.json({ answer: 'Ask a question about this company.', citations: [], tier: 0, telemetry: [] } satisfies AskResponse);
  }

  const { data, source } = await load(ticker, seedOnly);
  if (!data || !source) {
    return NextResponse.json({ answer: `No primary data loaded for ${ticker}.`, citations: [], tier: 0, telemetry: [] } satisfies AskResponse);
  }

  const report = buildCoreReport(data, source);
  const deep = !seedOnly ? await cacheGet<PullResearchReport>(`research:deep:${ticker}`) : undefined;
  if (deep?.audit.status === 'complete') report.audit = deep.audit;
  else applySeedNarrative(report);

  return NextResponse.json(await answerQuestion(data, report, question, ROUTE));
}
