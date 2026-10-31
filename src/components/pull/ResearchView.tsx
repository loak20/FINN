'use client';

import { ArrowRight, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ADHOC, PORTFOLIO, SEARCH_EXAMPLES, normaliseTicker } from '@/config/portfolio';
import { getJson, withSource } from '@/lib/client';
import type { PullResearchReport, ResearchResponse, SourceMode } from '@/types/finn';
import { useTelemetry } from '../shell/TelemetryContext';
import { cx } from '../ui/primitives';
import { AskBar } from './AskBar';
import { AuditModule, CashModule, ReportHeader, SnapshotModule, ThesisModule } from './ResearchModules';
import { CORE_STEPS, ScrapeLoader } from './ScrapeLoader';

type State =
  | { status: 'idle' }
  | { status: 'loading'; ticker: string }
  | { status: 'ready'; ticker: string; report: PullResearchReport }
  | { status: 'error'; ticker: string; error: string; suggestions: string[] };

export function ResearchView({
  target,
  sourceMode,
  onGlossary,
}: {
  target: { ticker: string; nonce: number } | null;
  sourceMode: SourceMode;
  onGlossary: (term: string) => void;
}) {
  const { record } = useTelemetry();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const [deepLoading, setDeepLoading] = useState(false);
  const cache = useRef(new Map<string, PullResearchReport>());
  const req = useRef(0);

  useEffect(() => {
    cache.current.clear();
  }, [sourceMode]);

  const runDeep = useCallback(
    async (ticker: string, id: number) => {
      setDeepLoading(true);
      try {
        const d = await getJson<ResearchResponse>(withSource(`/api/research/${encodeURIComponent(ticker)}?stage=deep`, sourceMode));
        if (id !== req.current) return;
        record(d.telemetry);
        if (d.ok) {
          cache.current.set(ticker, d.report);
          setState({ status: 'ready', ticker, report: d.report });
        }
      } catch {
        if (id !== req.current) return;
        setState((s) =>
          s.status === 'ready'
            ? { ...s, report: { ...s.report, audit: { ...s.report.audit, status: 'failed', note: 'The audit request was interrupted. Retry to resume; finished transcript reads are cached.' } } }
            : s,
        );
      } finally {
        if (id === req.current) setDeepLoading(false);
      }
    },
    [record, sourceMode],
  );

  const load = useCallback(
    async (raw: string) => {
      const ticker = normaliseTicker(raw);
      if (!ticker) return;
      const id = ++req.current;
      setQuery(ticker);
      setDeepLoading(false);

      const hit = cache.current.get(ticker);
      if (hit) {
        setState({ status: 'ready', ticker, report: hit });
        return;
      }

      setState({ status: 'loading', ticker });
      try {
        const r = await getJson<ResearchResponse>(withSource(`/api/research/${encodeURIComponent(ticker)}?stage=core`, sourceMode));
        if (id !== req.current) return;
        record(r.telemetry);
        if (!r.ok) {
          setState({ status: 'error', ticker, error: r.error, suggestions: r.suggestions });
          return;
        }
        setState({ status: 'ready', ticker, report: r.report });
        if (r.report.audit.status === 'queued') await runDeep(ticker, id);
        else cache.current.set(ticker, r.report);
      } catch {
        if (id !== req.current) return;
        setState({ status: 'error', ticker, error: 'Could not reach the FINN server. Check your connection and try again.', suggestions: ADHOC.map((s) => s.ticker) });
      }
    },
    [record, runDeep, sourceMode],
  );

  useEffect(() => {
    if (target) load(target.ticker);
    // Re-run only when a new deep-dive request arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce]);

  const active = state.status === 'idle' ? null : state.ticker;

  return (
    <section aria-labelledby="research-title">
      <div className="mb-3">
        <h2 id="research-title" className="text-[20px] font-bold tracking-tight text-zinc-50">
          Research
        </h2>
        <p className="text-[12px] text-zinc-500">Any NSE company, grounded only in its own filings and calls.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(query);
        }}
        className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2 focus-within:border-zinc-600"
      >
        <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          placeholder={`Any NSE ticker — ${SEARCH_EXAMPLES.join(', ')}…`}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="num w-full bg-transparent py-1 text-[15px] text-zinc-100 placeholder:font-sans placeholder:text-zinc-600 focus:outline-none"
          aria-label="NSE ticker"
        />
        <button type="submit" disabled={!query.trim()} className="tap rounded-xl bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-950 disabled:opacity-40">
          Go
        </button>
      </form>

      <div className="mt-3">
        <div className="label mb-1.5 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-signal" aria-hidden /> Ad-hoc picks
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ADHOC.map((s) => (
            <button
              key={s.ticker}
              type="button"
              onClick={() => load(s.ticker)}
              className={cx('chip', active === s.ticker ? 'border-signal bg-signal text-zinc-950' : 'border-signal/40 bg-signal/10 text-signal hover:bg-signal/20')}
            >
              {s.ticker}
            </button>
          ))}
        </div>
        <div className="label mb-1.5 mt-2.5">Portfolio</div>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {PORTFOLIO.map((s) => (
            <button
              key={s.ticker}
              type="button"
              onClick={() => load(s.ticker)}
              className={cx('chip shrink-0', active === s.ticker ? 'border-zinc-100 bg-zinc-100 text-zinc-950' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100')}
            >
              {s.ticker}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {state.status === 'idle' && (
          <div className="card p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-zinc-100">
              <ShieldCheck className="h-4 w-4 text-signal" aria-hidden /> Primary sources only
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
              FINN scrapes the company&apos;s statements live from Screener.in and reads management&apos;s own concall transcripts. No news, no broker notes, no model
              memory of the company.
            </p>
            <ul className="mt-3 space-y-1.5 text-[12px] text-zinc-300">
              {['Snapshot: 8 metrics + multi-year trajectory', 'Cash quality: do profits turn into cash?', 'Narrative vs. Numbers: promises held to account', 'Bull vs. bear + scoped Q&A'].map((x) => (
                <li key={x} className="flex gap-2">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => load('POLYCAB')} className="tap mt-4 w-full rounded-xl bg-zinc-100 py-2 text-[13px] font-semibold text-zinc-950">
              Try Polycab&apos;s audit
            </button>
          </div>
        )}

        {state.status === 'loading' && <ScrapeLoader steps={CORE_STEPS} title={`Researching ${state.ticker}`} />}

        {state.status === 'error' && (
          <div className="card p-4">
            <p className="text-[14px] font-semibold text-zinc-100">{state.ticker}: no research yet</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{state.error}</p>
            <div className="label mb-1.5 mt-3">Try</div>
            <div className="flex flex-wrap gap-1.5">
              {state.suggestions.map((s) => (
                <button key={s} type="button" onClick={() => load(s)} className="chip border-zinc-700 bg-zinc-900 text-zinc-200">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <ReportHeader r={state.report} />
            <SnapshotModule r={state.report} onGlossary={onGlossary} />
            <CashModule r={state.report} onGlossary={onGlossary} />
            <AuditModule r={state.report} deepLoading={deepLoading} onRetry={() => runDeep(state.ticker, req.current)} />
            <ThesisModule r={state.report} />
            <AskBar key={state.ticker} ticker={state.ticker} sourceMode={sourceMode} />
          </>
        )}
      </div>
    </section>
  );
}
