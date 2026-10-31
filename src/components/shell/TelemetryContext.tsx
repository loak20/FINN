'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { LlmStatus, TelemetryEvent } from '@/types/finn';

// Session-level router telemetry: every API response carries the events it generated
// (Tier 0 steps included), and the header pill / drawer read the running totals.

interface TelemetryState {
  events: TelemetryEvent[];
  llm: LlmStatus | null;
  record: (events: TelemetryEvent[] | undefined) => void;
  setLlm: (s: LlmStatus) => void;
  clear: () => void;
  totals: { cost: number; calls: Record<0 | 1 | 2, number>; cacheHits: number; inTok: number; outTok: number };
}

const Ctx = createContext<TelemetryState | null>(null);

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [llm, setLlm] = useState<LlmStatus | null>(null);

  const record = useCallback((incoming: TelemetryEvent[] | undefined) => {
    if (!incoming?.length) return;
    setEvents((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      const fresh = incoming.filter((e) => !seen.has(e.id));
      return fresh.length ? [...prev, ...fresh].slice(-300) : prev;
    });
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  const totals = useMemo(() => {
    const calls: Record<0 | 1 | 2, number> = { 0: 0, 1: 0, 2: 0 };
    let cost = 0;
    let cacheHits = 0;
    let inTok = 0;
    let outTok = 0;
    for (const e of events) {
      calls[e.tier] += 1;
      cost += e.costUsd;
      inTok += e.inputTokens;
      outTok += e.outputTokens;
      if (e.cacheHit) cacheHits += 1;
    }
    return { cost, calls, cacheHits, inTok, outTok };
  }, [events]);

  const value = useMemo(() => ({ events, llm, record, setLlm, clear, totals }), [events, llm, record, clear, totals]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTelemetry(): TelemetryState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTelemetry must be used inside TelemetryProvider');
  return v;
}
