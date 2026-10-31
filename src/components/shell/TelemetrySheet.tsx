'use client';

import { CheckCircle2, CircleSlash, Database, Trash2 } from 'lucide-react';
import { ROUTING_RULES } from '@/config/routing';
import { fmtUsd, timeAgo } from '@/lib/format';
import type { SourceMode } from '@/types/finn';
import { Sheet } from '../ui/Sheet';
import { TierBadge, cx } from '../ui/primitives';
import { useTelemetry } from './TelemetryContext';

export function TelemetrySheet({
  open,
  onClose,
  sourceMode,
  onSourceMode,
}: {
  open: boolean;
  onClose: () => void;
  sourceMode: SourceMode;
  onSourceMode: (m: SourceMode) => void;
}) {
  const { events, totals, llm, clear } = useTelemetry();
  const recent = [...events].reverse();

  return (
    <Sheet open={open} onClose={onClose} title="Smart Router" subtitle="Cheap where possible, smart only where it pays. Every step this session, priced.">
      <div className="grid grid-cols-4 gap-2">
        {[
          { k: 'Session spend', v: fmtUsd(totals.cost) },
          { k: 'Tier 0 steps', v: String(totals.calls[0]) },
          { k: 'Model calls', v: `${totals.calls[1]} · ${totals.calls[2]}`, sub: 'Flash · Pro' },
          { k: 'Cache hits', v: String(totals.cacheHits) },
        ].map((s) => (
          <div key={s.k} className="card px-2.5 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{s.k}</div>
            <div className="num mt-0.5 text-[15px] font-semibold text-zinc-100">{s.v}</div>
            {s.sub && <div className="text-[9px] text-zinc-500">{s.sub}</div>}
          </div>
        ))}
      </div>
      <div className="num mt-2 text-[11px] text-zinc-500">
        Tokens {totals.inTok.toLocaleString('en-IN')} in · {totals.outTok.toLocaleString('en-IN')} out (incl. thinking)
      </div>

      <div className="card mt-4 flex items-start gap-2.5 px-3 py-2.5 text-[12px]">
        {llm?.enabled ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />}
        <div className="text-zinc-300">
          {llm?.enabled ? (
            <>
              Gemini key configured. Tier 1 → <span className="num text-zinc-100">{llm.flash}</span>, Tier 2 → <span className="num text-zinc-100">{llm.pro}</span>.
            </>
          ) : (
            <>
              No <span className="num">GEMINI_API_KEY</span>: running fully on Tier 0 plus pre-computed audits. Every screen still works; add a key to unlock live transcript audits, PDF extraction and model Q&A.
            </>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="label mb-2">Data source</div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-900 p-1">
          {(
            [
              ['auto', 'Auto', 'live → cache → seed'],
              ['seed', 'Demo seed', 'offline snapshot'],
            ] as const
          ).map(([k, label, sub]) => (
            <button
              key={k}
              type="button"
              onClick={() => onSourceMode(k)}
              className={cx('tap rounded-lg px-3 py-2 text-left', sourceMode === k ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}
            >
              <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                <Database className="h-3.5 w-3.5" aria-hidden />
                {label}
              </div>
              <div className="text-[10px]">{sub}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="label mb-2">Routing rules</div>
        <div className="space-y-2">
          {ROUTING_RULES.map((r) => (
            <div key={r.tier} className="card px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TierBadge tier={r.tier} />
                  <span className="text-[13px] font-semibold text-zinc-100">{r.name}</span>
                </div>
                <span className="num text-[10px] text-zinc-500">{r.tier === 0 ? r.model : r.tier === 1 ? llm?.flash ?? r.model : llm?.pro ?? r.model}</span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">{r.why}</p>
              <ul className="mt-1.5 space-y-0.5 text-[11px] text-zinc-500">
                {r.tasks.map((t) => (
                  <li key={t} className="flex gap-1.5">
                    <span className="text-zinc-700">›</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="label">Event log · {events.length}</div>
          {events.length > 0 && (
            <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-[12px] text-zinc-500">No activity yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((e) => (
              <li key={e.id} className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <TierBadge tier={e.tier} />
                    <div className="min-w-0">
                      <div className="text-[12px] leading-snug text-zinc-200">{e.task}</div>
                      {e.note && <div className="text-[11px] text-zinc-500">{e.note}</div>}
                    </div>
                  </div>
                  <div className="num shrink-0 text-right text-[11px] text-zinc-300">{fmtUsd(e.costUsd)}</div>
                </div>
                <div className="num mt-1 flex flex-wrap gap-x-2.5 text-[10px] text-zinc-500">
                  <span>{e.model}</span>
                  {e.tier > 0 && (
                    <span>
                      {e.inputTokens.toLocaleString('en-IN')}→{e.outputTokens.toLocaleString('en-IN')} tok
                    </span>
                  )}
                  <span>{e.latencyMs} ms</span>
                  {e.cacheHit && <span className="text-sky-400">cache hit</span>}
                  <span>{timeAgo(e.at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
