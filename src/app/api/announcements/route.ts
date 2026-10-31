import { NextResponse, type NextRequest } from 'next/server';
import { PORTFOLIO } from '@/config/portfolio';
import { applyCuratedEnrichment, seedFilings } from '@/data/seed_data';
import { extractBio, extractResults } from '@/lib/enrich';
import { buildFilings, clusterFilings, refineWithFlash, type ScoredFiling } from '@/lib/filings';
import { mapLimit } from '@/lib/http';
import { modelFor } from '@/lib/llm';
import { getScreenerData } from '@/lib/screenerScraper';
import { skippedEvent, tier0Event } from '@/lib/telemetry';
import type { AnnouncementsResponse, EnrichRequest, EnrichResponse, TelemetryEvent } from '@/types/finn';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const ROUTE = '/api/announcements';

// GET: every BSE filing across the portfolio for the last 7 days (the client slices 24h/3d/7d),
// classified, scored, clustered and enriched. POST: on-demand PDF enrichment for one filing.

export async function GET(req: NextRequest) {
  const started = Date.now();
  const nowMs = Date.now();
  const seedOnly = req.nextUrl.searchParams.get('source') === 'seed';
  const allTickers = PORTFOLIO.map((s) => s.ticker);

  if (seedOnly) {
    const body: AnnouncementsResponse = {
      filings: seedFilings(nowMs),
      asOf: new Date(nowMs).toISOString(),
      mode: 'seed',
      coverage: { live: [], seed: allTickers },
      telemetry: [tier0Event(ROUTE, 'Seed digest: pre-classified BSE filings', started, { cacheHit: true, note: 'demo-seed mode' })],
    };
    return NextResponse.json(body);
  }

  try {
    const perStock = await mapLimit(PORTFOLIO, 4, async (stock) => {
      try {
        const { data, source } = await getScreenerData(stock.ticker);
        return { ticker: stock.ticker, scored: buildFilings(stock, data, source, nowMs) };
      } catch {
        return { ticker: stock.ticker, scored: null as ScoredFiling[] | null };
      }
    });

    const liveTickers = perStock.filter((p) => p.scored).map((p) => p.ticker);
    const failed = perStock.filter((p) => !p.scored).map((p) => p.ticker);
    const scored = perStock.flatMap((p) => p.scored ?? []);
    const telemetry: TelemetryEvent[] = [
      tier0Event(ROUTE, `BSE announcements via Screener · ${PORTFOLIO.length} companies`, started, {
        note: `${liveTickers.length} live/cached · ${failed.length} seed fallback`,
      }),
    ];

    const t1 = Date.now();
    const lowConfidence = scored.filter((s) => s.confidence === 'low').length;
    telemetry.push(tier0Event(ROUTE, 'Rules classifier → 17 categories + materiality score', t1, { note: `${scored.length} filings · ${lowConfidence} ambiguous` }));
    telemetry.push(
      tier0Event(ROUTE, 'Results QoQ/YoY matrix from structured quarterly tables', t1, {
        note: `${scored.filter((s) => s.filing.results).length} results tables at $0`,
      }),
    );

    telemetry.push(...(await refineWithFlash(scored, ROUTE)));

    const t2 = Date.now();
    const filings = clusterFilings(scored.map((s) => s.filing)).map(applyCuratedEnrichment);
    telemetry.push(tier0Event(ROUTE, 'Noise-cancel clustering of same-event filings', t2, { note: `${scored.length} filings → ${filings.length} items` }));

    if (failed.length) filings.push(...seedFilings(nowMs, failed));

    const body: AnnouncementsResponse = {
      filings,
      asOf: new Date(nowMs).toISOString(),
      mode: failed.length === 0 ? 'live' : liveTickers.length === 0 ? 'seed' : 'mixed',
      coverage: { live: liveTickers, seed: failed },
      telemetry,
    };
    return NextResponse.json(body);
  } catch (e) {
    const body: AnnouncementsResponse = {
      filings: seedFilings(nowMs),
      asOf: new Date(nowMs).toISOString(),
      mode: 'seed',
      coverage: { live: [], seed: allTickers },
      telemetry: [tier0Event(ROUTE, 'Seed digest after live pipeline error', started, { note: (e as Error).message.slice(0, 100) })],
    };
    return NextResponse.json(body);
  }
}

export async function POST(req: NextRequest) {
  let body: EnrichRequest;
  try {
    body = (await req.json()) as EnrichRequest;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body', telemetry: [] } satisfies EnrichResponse, { status: 400 });
  }
  const { action, filing } = body ?? {};
  if (!filing?.ticker || (action !== 'extract-results' && action !== 'extract-bio')) {
    return NextResponse.json({ ok: false, error: 'Expected { action: "extract-results" | "extract-bio", filing }', telemetry: [] } satisfies EnrichResponse, { status: 400 });
  }

  const started = Date.now();
  try {
    if (action === 'extract-results') {
      const { results, events } = await extractResults(filing, ROUTE);
      return NextResponse.json({ ok: true, results, telemetry: events } satisfies EnrichResponse);
    }
    const { bio, events } = await extractBio(filing, ROUTE);
    return NextResponse.json({ ok: true, bio, telemetry: events } satisfies EnrichResponse);
  } catch (e) {
    const message = (e as Error).message;
    return NextResponse.json({
      ok: false,
      error: message,
      telemetry: [skippedEvent(ROUTE, `${filing.ticker}: ${action}`, 1, modelFor(1), message.slice(0, 100), started)],
    } satisfies EnrichResponse);
  }
}
