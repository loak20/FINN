'use client';

import { ArrowRight, BellRing, FileText, Moon, Waves } from 'lucide-react';
import { useMemo } from 'react';
import { headlineOf } from '@/lib/client';
import { fmtDate, fmtMultiple, fmtPct, fmtPrice, fmtVolume } from '@/lib/format';
import type { AnnouncementsResponse, CorporateFiling, EODMarketItem } from '@/types/finn';
import { Meter, Sparkline } from '../ui/charts';
import { CategoryTag, Delta, Skeleton, SourceChip, cx } from '../ui/primitives';
import { FilingTime } from './FilingCards';

export interface Thresholds {
  price: number;
  volume: number;
  mode: 'any' | 'both';
}

export const DEFAULT_THRESHOLDS: Thresholds = { price: 2.5, volume: 1.8, mode: 'any' };

export function breaches(i: EODMarketItem, t: Thresholds): { price: boolean; volume: boolean; triggered: boolean } {
  const price = Math.abs(i.changePct) >= t.price;
  const volume = i.volumeMultiple >= t.volume;
  return { price, volume, triggered: t.mode === 'any' ? price || volume : price && volume };
}

const CATALYST_WINDOW_MS = 48 * 3_600_000;

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  hint,
  onChange,
  Icon,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint: string;
  onChange: (v: number) => void;
  Icon: typeof Waves;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <div className="label flex items-center gap-1">
            <Icon className="h-3 w-3" aria-hidden />
            {label}
          </div>
          <div className="text-[11px] text-zinc-500">{hint}</div>
        </div>
        <div className="num text-[22px] font-bold tracking-tight text-zinc-50">{display}</div>
      </div>
      <input
        type="range"
        className="finn-range mt-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        aria-label={label}
        aria-valuetext={display}
      />
      <div className="num flex justify-between text-[10px] text-zinc-600">
        <span>{min.toFixed(1)}</span>
        <span>{max.toFixed(1)}</span>
      </div>
    </div>
  );
}

function catalystsFor(ticker: string, ann: AnnouncementsResponse | null): CorporateFiling[] {
  if (!ann) return [];
  const now = Date.parse(ann.asOf);
  return ann.filings
    .filter((f) => f.ticker === ticker && now - Date.parse(f.filedAt) <= CATALYST_WINDOW_MS)
    .sort((a, b) => b.score - a.score);
}

function AlertCard({ item, t, ann, onDeepDive }: { item: EODMarketItem; t: Thresholds; ann: AnnouncementsResponse | null; onDeepDive: (ticker: string) => void }) {
  const b = breaches(item, t);
  const cats = catalystsFor(item.ticker, ann);
  const top = cats.slice(0, 2);

  return (
    <article className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-3.5 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="num rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-bold text-zinc-950">{item.ticker}</span>
            {item.source === 'seed' && <SourceChip source="seed" />}
          </div>
          <div className="mt-1 truncate text-[12px] text-zinc-400">
            {item.name} · {item.sector}
          </div>
        </div>
        <div className="text-right">
          <div className="num text-[15px] font-semibold text-zinc-50">{fmtPrice(item.close)}</div>
          <Delta value={item.changePct} digits={2} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-3.5">
        <div className="flex flex-wrap gap-1.5">
          <span className={cx('num rounded-md px-1.5 py-0.5 text-[10px] font-semibold', b.price ? 'bg-signal/15 text-signal' : 'bg-zinc-800 text-zinc-500')}>
            {b.price ? '●' : '○'} Price {fmtPct(item.changePct, { digits: 1 })} {b.price ? '≥' : '<'} ±{t.price}%
          </span>
          <span className={cx('num rounded-md px-1.5 py-0.5 text-[10px] font-semibold', b.volume ? 'bg-signal/15 text-signal' : 'bg-zinc-800 text-zinc-500')}>
            {b.volume ? '●' : '○'} Vol {fmtMultiple(item.volumeMultiple)} {b.volume ? '≥' : '<'} {t.volume}×
          </span>
        </div>
        <Sparkline values={item.closes} label={`${item.ticker} closes`} />
      </div>

      <div className="px-3.5 pt-2">
        <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
          <span>
            Volume <span className="num text-zinc-300">{fmtVolume(item.volume)}</span> vs 20D avg <span className="num text-zinc-300">{fmtVolume(item.avgVolume20)}</span>
          </span>
          <span className="num font-semibold text-zinc-300">{fmtMultiple(item.volumeMultiple)}</span>
        </div>
        <Meter value={item.volumeMultiple} threshold={t.volume} label={`${item.ticker} volume multiple`} />
      </div>

      <div className="mx-3.5 mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
        <div className="label mb-1.5">Catalyst check · exchange filings in last 48h</div>
        {top.length ? (
          <ul className="space-y-2">
            {top.map((f) => (
              <li key={f.id}>
                <div className="flex items-center justify-between gap-2">
                  <CategoryTag category={f.category} compact />
                  <FilingTime filing={f} asOf={ann!.asOf} />
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-zinc-200">{headlineOf(f).headline}</p>
              </li>
            ))}
            {cats.length > 2 && <li className="text-[11px] text-zinc-500">+{cats.length - 2} more filings in the window</li>}
          </ul>
        ) : (
          <p className="flex items-start gap-1.5 text-[12px] text-zinc-400">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
            No exchange filing in last 48h — pure price/volume action
          </p>
        )}
      </div>

      <div className="flex justify-end px-3.5 py-2.5">
        <button type="button" onClick={() => onDeepDive(item.ticker)} className="tap inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-950">
          Deep Dive <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </article>
  );
}

function QuietRow({ item, t, onPick }: { item: EODMarketItem; t: Thresholds; onPick: (ticker: string) => void }) {
  const pricePct = Math.min(100, (Math.abs(item.changePct) / t.price) * 100);
  const volPct = Math.min(100, (item.volumeMultiple / t.volume) * 100);
  return (
    <button type="button" onClick={() => onPick(item.ticker)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-zinc-900/60">
      <div className="w-[86px] shrink-0">
        <div className="num text-[12px] font-semibold text-zinc-200">{item.ticker}</div>
        <div className="num text-[10px] text-zinc-500">{fmtPrice(item.close)}</div>
      </div>
      <div className="flex-1 space-y-1.5">
        {[
          { k: 'price', pct: pricePct, label: fmtPct(item.changePct, { digits: 2 }) },
          { k: 'vol', pct: volPct, label: fmtMultiple(item.volumeMultiple) },
        ].map((r) => (
          <div key={r.k} className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-zinc-800">
              <div className="h-1 rounded-full bg-zinc-500" style={{ width: `${r.pct}%` }} />
            </div>
            <span className="num w-[52px] text-right text-[10px] text-zinc-400">{r.label}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

export function TriggersView({
  market,
  ann,
  thresholds,
  onThresholds,
  onDeepDive,
}: {
  market: EODMarketItem[] | null;
  ann: AnnouncementsResponse | null;
  thresholds: Thresholds;
  onThresholds: (t: Thresholds) => void;
  onDeepDive: (ticker: string) => void;
}) {
  const split = useMemo(() => {
    if (!market) return null;
    const severity = (i: EODMarketItem) => Math.max(Math.abs(i.changePct) / thresholds.price, i.volumeMultiple / thresholds.volume);
    const triggered = market.filter((i) => breaches(i, thresholds).triggered).sort((a, b) => severity(b) - severity(a));
    const quiet = market.filter((i) => !breaches(i, thresholds).triggered).sort((a, b) => severity(b) - severity(a));
    return { triggered, quiet };
  }, [market, thresholds]);

  return (
    <section aria-labelledby="triggers-title">
      <div className="mb-3">
        <h2 id="triggers-title" className="text-[20px] font-bold tracking-tight text-zinc-50">
          Triggers
        </h2>
        <p className="text-[12px] text-zinc-500">You decide what “unusual” means. FINN watches end-of-day data for it.</p>
      </div>

      <div className="card space-y-4 p-4">
        <Slider
          label="Daily price move"
          hint="Close vs previous close"
          value={thresholds.price}
          min={1}
          max={10}
          step={0.5}
          display={`±${thresholds.price.toFixed(1)}%`}
          onChange={(price) => onThresholds({ ...thresholds, price })}
          Icon={BellRing}
        />
        <Slider
          label="Unusual volume"
          hint="Last session vs 20-day average"
          value={thresholds.volume}
          min={1.2}
          max={5}
          step={0.2}
          display={`${thresholds.volume.toFixed(1)}×`}
          onChange={(volume) => onThresholds({ ...thresholds, volume: Math.round(volume * 10) / 10 })}
          Icon={Waves}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-500">Fire when</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-950 p-0.5">
            {(['any', 'both'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onThresholds({ ...thresholds, mode: m })}
                className={cx('rounded-md px-2.5 py-1 text-[11px] font-semibold', thresholds.mode === m ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500')}
              >
                {m === 'any' ? 'Either rule' : 'Both rules'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!split ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-baseline justify-between">
            <h3 className="text-[14px] font-semibold text-zinc-100">
              Triggered Anomaly Alerts <span className="num text-signal">{split.triggered.length}</span>
            </h3>
            {market?.[0] && <span className="num text-[10px] text-zinc-500">EOD {fmtDate(market[0].asOf)}</span>}
          </div>
          <div className="mt-2.5 space-y-3">
            {split.triggered.map((i) => (
              <AlertCard key={i.ticker} item={i} t={thresholds} ann={ann} onDeepDive={onDeepDive} />
            ))}
            {split.triggered.length === 0 && (
              <div className="card flex items-center gap-3 px-4 py-5">
                <Moon className="h-5 w-5 text-zinc-500" aria-hidden />
                <p className="text-[12px] text-zinc-400">Nothing crossed your thresholds today. Loosen a slider to see what is closest.</p>
              </div>
            )}
          </div>

          <h3 className="mt-6 text-[14px] font-semibold text-zinc-100">
            Quiet Portfolio Stocks <span className="num text-zinc-500">{split.quiet.length}</span>
          </h3>
          <p className="text-[11px] text-zinc-500">Bars show distance to your thresholds; the fullest are closest to firing.</p>
          <div className="card mt-2.5 divide-y divide-zinc-800/70 overflow-hidden">
            {split.quiet.map((i) => (
              <QuietRow key={i.ticker} item={i} t={thresholds} onPick={onDeepDive} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
