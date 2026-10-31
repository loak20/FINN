'use client';

import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cx } from '../ui/primitives';

// Step-by-step progress for a pipeline whose stages run server-side. Steps advance on a timer
// and the last one stays active until the response lands, so it never claims to be done early.

export const CORE_STEPS = [
  'Resolving NSE symbol',
  'Scraping Screener.in consolidated statements',
  'Parsing P&L · balance sheet · cash flow · ratios',
  'Computing ratios and cash conversion (Tier 0)',
];

export const DEEP_STEPS = [
  'Fetching concall transcripts from BSE',
  'Flash: extracting guidance from each call',
  'Pro: auditing promises against reported numbers',
];

export function ScrapeLoader({ steps, stepMs = 650, title }: { steps: string[]; stepMs?: number; title?: string }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
    const t = setInterval(() => setActive((a) => Math.min(a + 1, steps.length - 1)), stepMs);
    return () => clearInterval(t);
  }, [steps, stepMs]);

  return (
    <div className="card p-4" role="status" aria-live="polite">
      {title && <div className="label mb-3">{title}</div>}
      <ol className="space-y-2.5">
        {steps.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li key={s} className="flex items-center gap-2.5">
              <span
                className={cx(
                  'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                  done ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : current ? 'border-signal/50 text-signal' : 'border-zinc-700 text-zinc-700',
                )}
              >
                {done ? <Check className="h-3 w-3" /> : current ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="h-1 w-1 rounded-full bg-zinc-700" />}
              </span>
              <span className={cx('text-[12px]', done ? 'text-zinc-400' : current ? 'text-zinc-100' : 'text-zinc-600')}>{s}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
