'use client';

import { Loader2, MessageSquare, Send } from 'lucide-react';
import { useState } from 'react';
import { getJson } from '@/lib/client';
import type { AskResponse, SourceMode } from '@/types/finn';
import { useTelemetry } from '../shell/TelemetryContext';
import { TierBadge } from '../ui/primitives';

const SUGGESTIONS = ['Is the margin expanding?', 'Do profits convert to cash?', 'How levered is the balance sheet?', 'What has management guided?'];

interface Turn {
  q: string;
  a?: AskResponse;
  error?: string;
}

export function AskBar({ ticker, sourceMode }: { ticker: string; sourceMode: SourceMode }) {
  const { record } = useTelemetry();
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setQ('');
    setTurns((t) => [...t, { q: text }]);
    try {
      const a = await getJson<AskResponse>(`/api/research/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        body: JSON.stringify({ question: text, source: sourceMode }),
      });
      record(a.telemetry);
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4" aria-labelledby="ask">
      <div className="label mb-1 flex items-center gap-1">
        <MessageSquare className="h-3 w-3" aria-hidden /> Scoped primary-source Q&A
      </div>
      <p id="ask" className="text-[12px] text-zinc-400">
        Answers come only from {ticker}&apos;s statements and management&apos;s own transcripts. No news, no outside knowledge.
      </p>

      {turns.length > 0 && (
        <div className="mt-3 space-y-3">
          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-3 py-1.5 text-[12px] font-medium text-zinc-950">{t.q}</div>
              {t.a ? (
                <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                  <p className="text-[12px] leading-relaxed text-zinc-200">{t.a.answer}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <TierBadge tier={t.a.tier} />
                    {t.a.citations.map((c) => (
                      <span key={c} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ) : t.error ? (
                <p className="text-[12px] text-rose-300">{t.error}</p>
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => ask(s)} className="chip shrink-0 border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-zinc-100 disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>

      <form
        className="mt-2.5 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 focus-within:border-zinc-600"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Ask about ${ticker}…`}
          maxLength={300}
          className="w-full bg-transparent py-1 text-[14px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          aria-label="Ask a question"
        />
        <button type="submit" disabled={busy || !q.trim()} className="tap rounded-lg bg-signal p-1.5 text-zinc-950 disabled:opacity-40" aria-label="Send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </section>
  );
}
