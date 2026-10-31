'use client';

import { ArrowRight, ChevronDown, ExternalLink, GraduationCap, Layers, Loader2, Sparkles, Zap } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_DEFS } from '@/config/portfolio';
import { getJson, headlineOf, initials } from '@/lib/client';
import { fiscalQuarter, fmtDateTime, fmtNum, timeAgo } from '@/lib/format';
import type { CorporateFiling, EnrichResponse, ExecutiveBio, ResultsTable } from '@/types/finn';
import { useTelemetry } from '../shell/TelemetryContext';
import { CategoryTag, DeltaPill, MaterialityMark, SourceChip, cx } from '../ui/primitives';

type Update = (id: string, patch: Partial<CorporateFiling>) => void;

function useEnrich(filing: CorporateFiling, onUpdate: Update) {
  const { record } = useTelemetry();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'extract-results' | 'extract-bio') {
    setBusy(true);
    setError(null);
    try {
      const r = await getJson<EnrichResponse>('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          action,
          filing: { id: filing.id, ticker: filing.ticker, title: filing.title, detail: filing.detail, url: filing.url, filedAt: filing.filedAt },
        }),
      });
      record(r.telemetry);
      if (r.ok && r.results) onUpdate(filing.id, { results: r.results });
      else if (r.ok && r.bio) onUpdate(filing.id, { bio: r.bio });
      else setError(r.error ?? 'Extraction failed');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

// ---------------------------------------------------------------------------
// Results: the 4x3 headline matrix
// ---------------------------------------------------------------------------

function ResultsMatrix({ r }: { r: ResultsTable }) {
  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60">
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-0 px-3 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <span>₹ Cr · {fiscalQuarter(r.period)}</span>
        <span className="text-right">Current</span>
        <span className="w-[62px] text-right">QoQ</span>
        <span className="w-[62px] text-right">YoY</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-3 pb-2.5">
        {r.rows.map((row) => (
          <div key={row.metric} className="contents">
            <span className="border-t border-zinc-800/70 py-1.5 text-[12px] text-zinc-300">{row.metric === 'EBITDA' ? r.ebitdaLabel : row.metric}</span>
            <span className="num border-t border-zinc-800/70 py-1.5 text-right text-[13px] font-semibold text-zinc-100">{fmtNum(row.current)}</span>
            <span className="flex w-[62px] justify-end border-t border-zinc-800/70 py-1.5">
              <DeltaPill value={row.qoqPct} />
            </span>
            <span className="flex w-[62px] justify-end border-t border-zinc-800/70 py-1.5">
              <DeltaPill value={row.yoyPct} />
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800/70 px-3 py-2">
        <p className="flex gap-1.5 text-[12px] leading-snug text-zinc-300">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" aria-hidden />
          {r.marginTakeaway}
        </p>
        <p className="num mt-1 text-[10px] text-zinc-500">
          QoQ vs {fiscalQuarter(r.prevPeriod)} · YoY vs {fiscalQuarter(r.yearAgoPeriod)} · {r.basis} ·{' '}
          {r.source === 'screener' ? 'structured tables, Tier 0, $0' : 'extracted from filing PDF, Flash'}
        </p>
      </div>
    </div>
  );
}

function ResultsBlock({ filing, llmEnabled, onUpdate }: { filing: CorporateFiling; llmEnabled: boolean; onUpdate: Update }) {
  const { busy, error, run } = useEnrich(filing, onUpdate);
  const r = filing.results;
  const canExtract = llmEnabled && Boolean(filing.url);
  if (!r && filing.score < 55) return null;

  return (
    <>
      {r && <ResultsMatrix r={r} />}
      {(!r || r.stale) && (
        <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200/90">
          <p>{r?.note ?? 'No structured results table for this filing yet.'}</p>
          {canExtract ? (
            <button type="button" disabled={busy} onClick={() => run('extract-results')} className="tap mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200 disabled:opacity-60">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Read the filing PDF · Flash
            </button>
          ) : (
            <p className="mt-1 text-[11px] text-amber-200/60">Add GEMINI_API_KEY to read numbers straight from the filing PDF.</p>
          )}
          {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Management change: who is this person?
// ---------------------------------------------------------------------------

const CHANGE_LABEL: Record<ExecutiveBio['change'], string> = {
  appointed: 'Incoming',
  resigned: 'Outgoing',
  retired: 'Retiring',
  redesignated: 'Re-designated',
  other: 'Change',
};

const BIO_SOURCE: Record<ExecutiveBio['source'], string> = {
  filing: 'From the Reg-30 annexure (brief profile) in the filing',
  llm: 'Flash extract of the filing annexure',
  curated: 'Filing facts + public profile, compiled at build time',
};

function BioBlock({ filing, llmEnabled, onUpdate }: { filing: CorporateFiling; llmEnabled: boolean; onUpdate: Update }) {
  const { busy, error, run } = useEnrich(filing, onUpdate);
  const b = filing.bio;

  if (!b) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-zinc-700 px-3 py-2.5 text-[12px] text-zinc-400">
        <p>Who is this? Appointment filings carry a brief profile in their annexure; FINN can read it for you.</p>
        {llmEnabled && filing.url ? (
          <button type="button" disabled={busy} onClick={() => run('extract-bio')} className="tap mt-2 inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1 text-[11px] font-semibold text-zinc-100 disabled:opacity-60">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-signal" />}
            Pull bio from filing · Flash
          </button>
        ) : (
          <p className="mt-1 text-[11px] text-zinc-500">Add GEMINI_API_KEY to extract it automatically, or open the filing below.</p>
        )}
        {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="label mb-2">Executive background</div>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 text-[13px] font-bold text-zinc-100">{initials(b.person)}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[14px] font-semibold text-zinc-50">{b.person}</span>
            <span className="rounded bg-signal/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal">{CHANGE_LABEL[b.change]}</span>
          </div>
          <div className="text-[12px] text-zinc-400">{b.role}</div>
        </div>
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-300">{b.summary}</p>
      {b.career.length > 0 && (
        <ul className="mt-2.5 space-y-1 border-l border-zinc-800 pl-3">
          {b.career.map((c) => (
            <li key={c} className="relative text-[12px] text-zinc-300">
              <span className="absolute -left-[15.5px] top-[7px] h-1.5 w-1.5 rounded-full bg-zinc-500" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      )}
      {b.education && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-zinc-400">
          <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
          {b.education}
        </p>
      )}
      <p className="mt-2 text-[10px] text-zinc-600">{BIO_SOURCE[b.source]}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export function FilingTime({ filing, asOf }: { filing: CorporateFiling; asOf: string }) {
  if (filing.source === 'seed' && filing.originalFiledAt) {
    return <span className="num text-[10px] text-zinc-500">filed {fmtDateTime(filing.originalFiledAt)}</span>;
  }
  return <span className="num text-[10px] text-zinc-500">{timeAgo(filing.filedAt, asOf)}</span>;
}

export function FilingCard({
  filing,
  asOf,
  llmEnabled,
  onUpdate,
  onDeepDive,
}: {
  filing: CorporateFiling;
  asOf: string;
  llmEnabled: boolean;
  onUpdate: Update;
  onDeepDive: (ticker: string) => void;
}) {
  const [related, setRelated] = useState(false);
  const { headline, sub } = headlineOf(filing);

  return (
    <article className={cx('card p-3.5', filing.materiality === 'high' && 'border-zinc-700/80')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="num rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-bold text-zinc-950">{filing.ticker}</span>
          <span className="truncate text-[12px] text-zinc-400">{filing.company}</span>
        </div>
        <FilingTime filing={filing} asOf={asOf} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CategoryTag category={filing.category} />
        <MaterialityMark materiality={filing.materiality} score={filing.score} />
        {filing.classifiedBy === 'flash' && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">Flash</span>}
        {filing.source === 'seed' && <SourceChip source="seed" />}
      </div>

      <h4 className="mt-2 text-[14px] font-semibold leading-snug text-zinc-50">{headline}</h4>
      {sub && <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-zinc-400">{sub}</p>}

      {filing.category === 'results' && <ResultsBlock filing={filing} llmEnabled={llmEnabled} onUpdate={onUpdate} />}
      {filing.category === 'management_change' && <BioBlock filing={filing} llmEnabled={llmEnabled} onUpdate={onUpdate} />}

      {related && filing.related && (
        <ul className="mt-3 space-y-1.5 border-l border-zinc-800 pl-3">
          {filing.related.map((r) => (
            <li key={`${r.title}${r.filedAt}`} className="text-[12px] text-zinc-400">
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-200">
                  {r.title} <ExternalLink className="inline h-3 w-3" aria-hidden />
                </a>
              ) : (
                r.title
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-2.5">
        <div className="flex items-center gap-3">
          {filing.related?.length ? (
            <button type="button" onClick={() => setRelated((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200">
              <Layers className="h-3.5 w-3.5" aria-hidden />+{filing.related.length} folded
              <ChevronDown className={cx('h-3 w-3 transition-transform', related && 'rotate-180')} aria-hidden />
            </button>
          ) : null}
          {filing.url && (
            <a href={filing.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200">
              Filing <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
        <button type="button" onClick={() => onDeepDive(filing.ticker)} className="tap inline-flex items-center gap-1 text-[11px] font-semibold text-signal">
          Deep Dive <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Buried routine filings
// ---------------------------------------------------------------------------

export function BuriedTray({ filings, asOf }: { filings: CorporateFiling[]; asOf: string }) {
  const [open, setOpen] = useState(false);
  if (!filings.length) return null;
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-zinc-800">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left" aria-expanded={open}>
        <span className="text-[12px] text-zinc-400">
          View <span className="num font-semibold text-zinc-200">{filings.length}</span> Buried Routine Filings — ESOPs, Compliance, Postal Ballots
        </span>
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-zinc-500 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul className="divide-y divide-zinc-800/70 border-t border-zinc-800/70">
          {filings.map((f) => (
            <li key={f.id} className="px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="num text-[11px] font-semibold text-zinc-300">{f.ticker}</span>
                  <CategoryTag category={f.category} compact />
                </div>
                <FilingTime filing={f} asOf={asOf} />
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] text-zinc-500">{headlineOf(f).headline}</p>
              <p className="num mt-0.5 text-[10px] text-zinc-600">
                score {f.score} · {CATEGORY_DEFS[f.category].label.toLowerCase()} · buried below 40
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
