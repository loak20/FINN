'use client';

import {
  ArrowDownRight,
  ArrowUpRight,
  Database,
  FileText,
  Gavel,
  HandCoins,
  Landmark,
  Megaphone,
  Minus,
  Phone,
  Scale,
  ShieldAlert,
  Sparkles,
  Split,
  UserRound,
  Users,
  Vote,
  Wallet,
  Factory,
  Handshake,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { CATEGORY_DEFS } from '@/config/portfolio';
import { fmtPct } from '@/lib/format';
import type { DataSource, FilingCategory, Materiality } from '@/types/finn';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------

export function Delta({ value, digits = 1, size = 'sm', suffix }: { value: number | null; digits?: number; size?: 'xs' | 'sm'; suffix?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className="num text-zinc-500">—</span>;
  const up = value > 0.0001;
  const down = value < -0.0001;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span
      className={cx(
        'num inline-flex items-center gap-0.5 font-semibold',
        size === 'xs' ? 'text-[11px]' : 'text-xs',
        up ? 'text-emerald-400' : down ? 'text-rose-400' : 'text-zinc-400',
      )}
    >
      <Icon className={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
      {fmtPct(value, { digits })}
      {suffix}
    </span>
  );
}

export function DeltaPill({ value, digits = 1 }: { value: number | null; digits?: number }) {
  if (value === null || !Number.isFinite(value)) return <span className="num rounded-md bg-zinc-800/60 px-1.5 py-0.5 text-[11px] text-zinc-500">—</span>;
  const up = value > 0.0001;
  const down = value < -0.0001;
  return (
    <span
      className={cx(
        'num inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        up ? 'bg-emerald-500/10 text-emerald-400' : down ? 'bg-rose-500/10 text-rose-400' : 'bg-zinc-800 text-zinc-400',
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : down ? <ArrowDownRight className="h-3 w-3" aria-hidden /> : null}
      {fmtPct(value, { digits })}
    </span>
  );
}

// ---------------------------------------------------------------------------

const SOURCE_STYLE: Record<DataSource, string> = {
  live: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  cache: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  seed: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};

export function SourceChip({ source, label }: { source: DataSource; label?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', SOURCE_STYLE[source])}>
      <Database className="h-3 w-3" aria-hidden />
      {label ?? source}
    </span>
  );
}

// ---------------------------------------------------------------------------

export const CATEGORY_ICON: Record<FilingCategory, LucideIcon> = {
  results: BarChart3,
  'M&A': Handshake,
  fund_raise: HandCoins,
  management_change: UserRound,
  litigation: Gavel,
  insider_trading: Users,
  earnings_call: Phone,
  investor_meetings: Users,
  credit_rating: Scale,
  dividend: Wallet,
  bonus_split: Split,
  capex: Factory,
  press_release: Megaphone,
  postal_ballot: Vote,
  agm_egm: Landmark,
  pledging: ShieldAlert,
  unclassified: FileText,
};

export function CategoryTag({ category, compact }: { category: FilingCategory; compact?: boolean }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md bg-zinc-800/80 font-medium text-zinc-300', compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]')}>
      <Icon className="h-3 w-3 text-zinc-400" aria-hidden />
      {CATEGORY_DEFS[category].label}
    </span>
  );
}

const MATERIALITY_STYLE: Record<Materiality, { dot: string; text: string; label: string }> = {
  high: { dot: 'bg-signal', text: 'text-signal', label: 'High' },
  medium: { dot: 'bg-sky-400', text: 'text-sky-300', label: 'Medium' },
  routine: { dot: 'bg-zinc-600', text: 'text-zinc-500', label: 'Routine' },
};

export function MaterialityMark({ materiality, score }: { materiality: Materiality; score: number }) {
  const s = MATERIALITY_STYLE[materiality];
  return (
    <span className={cx('inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider', s.text)} title={`Materiality score ${score}/100`}>
      <span className={cx('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />
      {s.label} · {score}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function SectionHeader({ eyebrow, title, right, hero }: { eyebrow?: string; title: string; right?: React.ReactNode; hero?: boolean }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <div className={cx('label mb-1 flex items-center gap-1', hero && 'text-signal')}>
            {hero && <Sparkles className="h-3 w-3" aria-hidden />}
            {eyebrow}
          </div>
        )}
        <h3 className="text-[15px] font-semibold leading-tight text-zinc-100">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('shimmer rounded-xl', className)} />;
}

export function TierBadge({ tier }: { tier: 0 | 1 | 2 }) {
  const style = tier === 0 ? 'bg-zinc-800 text-zinc-300' : tier === 1 ? 'bg-sky-500/15 text-sky-300' : 'bg-violet-500/15 text-violet-300';
  return <span className={cx('num rounded px-1.5 py-0.5 text-[10px] font-bold', style)}>T{tier}</span>;
}
