'use client';

import { BookOpen, Cpu } from 'lucide-react';
import { fmtUsd } from '@/lib/format';
import { useTelemetry } from './TelemetryContext';

export function Header({ onRouter, onGlossary }: { onRouter: () => void; onGlossary: () => void }) {
  const { totals, llm } = useTelemetry();
  const router = !llm ? '…' : llm.enabled ? 'Flash/Pro' : 'Tier 0';

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/85 px-4 pb-2.5 pt-3 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-signal shadow-[0_0_12px_rgba(245,184,61,0.8)]" aria-hidden />
            <span className="text-[17px] font-bold tracking-tight text-zinc-50">FINN</span>
          </div>
          <div className="num truncate text-[10px] tracking-wide text-zinc-500">// ENAM Intelligence Layer</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRouter}
            className="tap inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-zinc-700"
            aria-label="Open smart router telemetry"
          >
            <Cpu className="h-3.5 w-3.5 text-signal" aria-hidden />
            <span className="whitespace-nowrap">
              Router: <span className="font-semibold text-zinc-100">{router}</span> • Cost: <span className="num font-semibold text-zinc-100">{fmtUsd(totals.cost)}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onGlossary}
            className="tap rounded-full border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 hover:border-zinc-700"
            aria-label="Open financial glossary"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
