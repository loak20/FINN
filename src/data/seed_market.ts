import type { EODMarketItem } from '@/types/finn';
import snapshot from './snapshots/market.json';

// Real Yahoo Finance EOD snapshot (captured by `npm run snapshot`), used whenever the live
// chart API rate-limits or times out. Values are genuine closes/volumes as of `asOf`.

const SNAP = snapshot as unknown as { asOf: string; items: EODMarketItem[] };

export const SEED_MARKET_AS_OF = SNAP.asOf;

export function seedMarketItem(ticker: string): EODMarketItem | undefined {
  const item = SNAP.items.find((i) => i.ticker === ticker);
  return item ? { ...item, source: 'seed' } : undefined;
}

export function seedMarket(): EODMarketItem[] {
  return SNAP.items.map((i) => ({ ...i, source: 'seed' }));
}
