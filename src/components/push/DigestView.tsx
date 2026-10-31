'use client';

import { RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { CATEGORY_DEFS, DIGEST_FILTERS, MATERIAL_SCORE, PORTFOLIO, WINDOW_HOURS } from '@/config/portfolio';
import { fmtDate } from '@/lib/format';
import type { AnnouncementsResponse, CorporateFiling, DigestFilter, TimeWindow } from '@/types/finn';
import { Skeleton, SourceChip, cx } from '../ui/primitives';
import { BuriedTray, FilingCard } from './FilingCards';

export function inWindow(filings: CorporateFiling[], asOf: string, window: TimeWindow): CorporateFiling[] {
  const now = Date.parse(asOf);
  const span = WINDOW_HOURS[window] * 3_600_000;
  return filings.filter((f) => now - Date.parse(f.filedAt) <= span);
}

export function DigestView({
  data,
  loading,
  window,
  onWindow,
  filter,
  onFilter,
  llmEnabled,
  onUpdate,
  onDeepDive,
  onRefresh,
}: {
  data: AnnouncementsResponse | null;
  loading: boolean;
  window: TimeWindow;
  onWindow: (w: TimeWindow) => void;
  filter: DigestFilter;
  onFilter: (f: DigestFilter) => void;
  llmEnabled: boolean;
  onUpdate: (id: string, patch: Partial<CorporateFiling>) => void;
  onDeepDive: (ticker: string) => void;
  onRefresh: () => void;
}) {
  const view = useMemo(() => {
    if (!data) return null;
    const scoped = inWindow(data.filings, data.asOf, window);
    const material = scoped.filter((f) => f.score >= MATERIAL_SCORE);
    const buried = scoped.filter((f) => f.score < MATERIAL_SCORE).sort((a, b) => Date.parse(b.filedAt) - Date.parse(a.filedAt));
    const folded = material.reduce((n, f) => n + (f.related?.length ?? 0), 0);
    const counts = Object.fromEntries(DIGEST_FILTERS.map((d) => [d.key, d.key === 'all' ? material.length : material.filter((f) => CATEGORY_DEFS[f.category].filter === d.key).length])) as Record<DigestFilter, number>;
    const feed = material
      .filter((f) => filter === 'all' || CATEGORY_DEFS[f.category].filter === filter)
      .sort((a, b) => b.score - a.score || Date.parse(b.filedAt) - Date.parse(a.filedAt));
    return { material, buried, folded, counts, feed };
  }, [data, window, filter]);

  const nextWindow: TimeWindow | null = window === '24h' ? '3d' : window === '3d' ? '7d' : null;

  return (
    <section aria-labelledby="digest-title">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="digest-title" className="text-[20px] font-bold tracking-tight text-zinc-50">
            Digest
          </h2>
          <p className="text-[12px] text-zinc-500">Every exchange filing across {PORTFOLIO.length} holdings, triaged.</p>
        </div>
        <button type="button" onClick={onRefresh} className="tap rounded-full border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:text-zinc-100" aria-label="Refresh digest">
          <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1" role="tablist" aria-label="Time window">
        {(['24h', '3d', '7d'] as TimeWindow[]).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={window === w}
            onClick={() => onWindow(w)}
            className={cx('tap rounded-lg py-1.5 text-[12px] font-semibold', window === w ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200')}
          >
            Last {w}
          </button>
        ))}
      </div>

      <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4">
        {DIGEST_FILTERS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => onFilter(d.key)}
            className={cx('chip shrink-0', filter === d.key ? 'border-zinc-200 bg-zinc-100 text-zinc-950' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200')}
          >
            {d.label}
            {view && <span className={cx('num text-[10px]', filter === d.key ? 'text-zinc-600' : 'text-zinc-500')}>{view.counts[d.key]}</span>}
          </button>
        ))}
      </div>

      {!view ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-10 w-full rounded-full" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <div className="mt-3.5 rounded-full bg-signal px-3.5 py-2 text-center text-[12px] font-semibold text-zinc-950 shadow-[0_6px_24px_-8px_rgba(245,184,61,0.6)]">
            ⚡ {view.material.length} Material Signal{view.material.length === 1 ? '' : 's'} Surfaced • 🧹 {view.buried.length} Routine Filing{view.buried.length === 1 ? '' : 's'} Buried
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
            {data && (
              <SourceChip
                source={data.mode === 'seed' ? 'seed' : 'live'}
                label={data.mode === 'seed' ? 'Seed snapshot' : data.mode === 'mixed' ? `Live · ${data.coverage.seed.length} seeded` : 'Live · BSE via Screener'}
              />
            )}
            {view.folded > 0 && <span>{view.folded} same-event filings folded</span>}
            {data?.mode === 'seed' && data.filings[0]?.originalFiledAt && <span>real filings captured {fmtDate(data.filings[0].originalFiledAt)}, re-timed to now</span>}
          </div>

          <div className="mt-4 space-y-3">
            {view.feed.map((f) => (
              <FilingCard key={f.id} filing={f} asOf={data!.asOf} llmEnabled={llmEnabled} onUpdate={onUpdate} onDeepDive={onDeepDive} />
            ))}

            {view.feed.length === 0 && (
              <div className="card px-4 py-6 text-center">
                <p className="text-[14px] font-semibold text-zinc-200">
                  {view.material.length === 0 ? `Nothing material in the last ${window}.` : `No ${DIGEST_FILTERS.find((d) => d.key === filter)?.label} filings in the last ${window}.`}
                </p>
                <p className="mt-1 text-[12px] text-zinc-500">That is the point: silence means nothing needs you.</p>
                <div className="mt-3 flex justify-center gap-2">
                  {filter !== 'all' && (
                    <button type="button" onClick={() => onFilter('all')} className="tap rounded-lg bg-zinc-800 px-3 py-1.5 text-[12px] font-semibold text-zinc-100">
                      Show all material
                    </button>
                  )}
                  {nextWindow && (
                    <button type="button" onClick={() => onWindow(nextWindow)} className="tap rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-950">
                      Widen to {nextWindow}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <BuriedTray filings={view.buried} asOf={data!.asOf} />
        </>
      )}
    </section>
  );
}
