'use client';

import { fmtDate, fmtPct } from '@/lib/format';
import type { EODMarketItem } from '@/types/finn';
import { Skeleton, cx } from '../ui/primitives';

// Always-visible pulse of the book: breadth, alerts at the current thresholds, and every
// holding's day move. Tap a name to research it.

export function PortfolioStrip({
  items,
  alerts,
  material24h,
  onPick,
}: {
  items: EODMarketItem[] | null;
  alerts: number;
  material24h: number | null;
  onPick: (ticker: string) => void;
}) {
  if (!items) {
    return (
      <div className="flex gap-2 overflow-hidden px-4 py-2.5">
        <Skeleton className="h-11 w-28 shrink-0" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-20 shrink-0" />
        ))}
      </div>
    );
  }

  const up = items.filter((i) => i.changePct > 0).length;
  const down = items.filter((i) => i.changePct < 0).length;
  const avg = items.length ? items.reduce((a, i) => a + i.changePct, 0) / items.length : 0;
  const asOf = items[0]?.asOf;
  const sorted = [...items].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  return (
    <div className="border-b border-zinc-800/60">
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5">
        <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-1.5">
          <div className="label">Portfolio · {items.length}</div>
          <div className="mt-0.5 flex items-baseline gap-2 text-[12px]">
            <span className={cx('num font-semibold', avg >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{fmtPct(avg, { digits: 2 })}</span>
            <span className="num text-zinc-500">
              {up}▲ {down}▼
            </span>
            <span className="text-zinc-500">
              {alerts} alert{alerts === 1 ? '' : 's'}
              {material24h !== null && ` · ${material24h} filing${material24h === 1 ? '' : 's'} 24h`}
            </span>
          </div>
        </div>
        {sorted.map((i) => (
          <button
            key={i.ticker}
            type="button"
            onClick={() => onPick(i.ticker)}
            className="tap shrink-0 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5 text-left hover:border-zinc-700"
            aria-label={`${i.ticker} ${fmtPct(i.changePct)}: open research`}
          >
            <div className="num text-[11px] font-semibold text-zinc-200">{i.ticker}</div>
            <div className={cx('num text-[11px] font-semibold', i.changePct > 0 ? 'text-emerald-400' : i.changePct < 0 ? 'text-rose-400' : 'text-zinc-400')}>
              {i.changePct > 0 ? '▲' : i.changePct < 0 ? '▼' : '•'} {fmtPct(Math.abs(i.changePct), { sign: false })}
            </div>
          </button>
        ))}
        {asOf && <div className="flex shrink-0 items-center pl-1 pr-2 text-[10px] text-zinc-600">EOD {fmtDate(asOf)}</div>}
      </div>
    </div>
  );
}
