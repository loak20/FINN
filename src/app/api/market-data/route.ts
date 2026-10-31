import { NextResponse, type NextRequest } from 'next/server';
import { PORTFOLIO } from '@/config/portfolio';
import { SEED_MARKET_AS_OF, seedMarket, seedMarketItem } from '@/data/seed_data';
import { TTL, cacheGetStale, cached } from '@/lib/cache';
import { mapLimit } from '@/lib/http';
import { llmStatus } from '@/lib/llm';
import { tier0Event } from '@/lib/telemetry';
import { fetchEOD } from '@/lib/yahoo';
import type { EODMarketItem, MarketDataResponse } from '@/types/finn';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ROUTE = '/api/market-data';

async function liveItems(): Promise<EODMarketItem[]> {
  const items = await mapLimit(PORTFOLIO, 4, async (stock): Promise<EODMarketItem | undefined> => {
    const key = `eod:${stock.ticker}`;
    try {
      const { value, hit } = await cached(key, TTL.eod, () => fetchEOD(stock));
      return { ...value, source: hit ? 'cache' : 'live' };
    } catch {
      const stale = await cacheGetStale<EODMarketItem>(key);
      if (stale) return { ...stale.value, source: 'cache' };
      return seedMarketItem(stock.ticker);
    }
  });
  return items.filter((i): i is EODMarketItem => Boolean(i));
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  const seedOnly = req.nextUrl.searchParams.get('source') === 'seed';

  let items: EODMarketItem[];
  try {
    items = seedOnly ? seedMarket() : await liveItems();
  } catch {
    items = seedMarket();
  }

  const coverage = {
    live: items.filter((i) => i.source === 'live').length,
    cache: items.filter((i) => i.source === 'cache').length,
    seed: items.filter((i) => i.source === 'seed').length,
  };
  const asOf = items.reduce((max, i) => (i.asOf > max ? i.asOf : max), items.length ? items[0].asOf : SEED_MARKET_AS_OF);

  const body: MarketDataResponse = {
    items,
    asOf,
    coverage,
    llm: llmStatus(),
    telemetry: [
      tier0Event(ROUTE, `EOD % change + 20D volume multiple · ${items.length} stocks`, started, {
        cacheHit: coverage.live === 0 && coverage.cache > 0,
        note: `${coverage.live} live · ${coverage.cache} cache · ${coverage.seed} seed`,
      }),
    ],
  };
  return NextResponse.json(body);
}
