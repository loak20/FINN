import type { EODMarketItem, StockMeta } from '@/types/finn';
import { HttpError, fetchWithTimeout } from './http';

// Yahoo Finance v8 chart API, one month of daily bars per NSE symbol. All math is Tier 0.

interface ChartReply {
  chart?: {
    result?: {
      meta?: { symbol?: string; longName?: string; shortName?: string };
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

export async function fetchEOD(stock: StockMeta): Promise<EODMarketItem> {
  let lastErr: unknown = new Error(`No Yahoo symbol for ${stock.ticker}`);

  for (const sym of stock.yahoo) {
    const symbol = `${sym}.NS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    try {
      const res = await fetchWithTimeout(url, { timeoutMs: 6000, headers: { Accept: 'application/json' } });
      if (res.status === 404) {
        lastErr = new HttpError(404, `${symbol} not found`);
        continue; // renamed/delisted symbol: try the next alias
      }
      if (!res.ok) throw new HttpError(res.status, `Yahoo ${res.status} for ${symbol}`);
      const json = (await res.json()) as ChartReply;
      const result = json.chart?.result?.[0];
      if (!result || json.chart?.error) {
        lastErr = new Error(json.chart?.error?.description ?? `Empty chart for ${symbol}`);
        continue;
      }
      return computeEOD(stock, symbol, result);
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status === 429) break; // rate limited: let the caller fall back now
    }
  }
  throw lastErr;
}

function computeEOD(
  stock: StockMeta,
  symbol: string,
  result: NonNullable<NonNullable<ChartReply['chart']>['result']>[number],
): EODMarketItem {
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const bars = ts
    .map((t, i) => ({ t, c: q.close?.[i] ?? null, v: q.volume?.[i] ?? null }))
    .filter((b): b is { t: number; c: number; v: number } => b.c !== null && b.v !== null && b.c > 0);

  if (bars.length < 3) throw new Error(`Not enough bars for ${symbol}`);

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  // Average of up to 20 sessions *before* the last bar, so today's spike doesn't dilute its own baseline.
  const prior = bars.slice(-21, -1).map((b) => b.v);
  const avgVolume20 = prior.reduce((a, b) => a + b, 0) / prior.length;

  return {
    ticker: stock.ticker,
    symbol,
    name: stock.name,
    sector: stock.sector,
    close: round2(last.c),
    prevClose: round2(prev.c),
    changePct: round2(((last.c - prev.c) / prev.c) * 100),
    volume: last.v,
    avgVolume20: Math.round(avgVolume20),
    volumeMultiple: avgVolume20 > 0 ? round2(last.v / avgVolume20) : 0,
    closes: bars.slice(-22).map((b) => round2(b.c)),
    asOf: new Date(last.t * 1000).toISOString(),
    source: 'live',
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
