import { randomUUID } from 'crypto';
import type { ModelTier, TelemetryEvent } from '@/types/finn';

export function newEventId(): string {
  return randomUUID();
}

/** A $0 deterministic step, logged so the router drawer shows what never reached a model. */
export function tier0Event(route: string, task: string, startedAt: number, opts: { cacheHit?: boolean; note?: string } = {}): TelemetryEvent {
  return {
    id: newEventId(),
    at: new Date().toISOString(),
    route,
    task,
    tier: 0,
    model: 'deterministic',
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    cacheHit: opts.cacheHit ?? false,
    latencyMs: Date.now() - startedAt,
    note: opts.note,
  };
}

/** A model call that was skipped or failed; recorded so degradations are visible, never silent. */
export function skippedEvent(route: string, task: string, tier: ModelTier, model: string, note: string, startedAt = Date.now()): TelemetryEvent {
  return {
    id: newEventId(),
    at: new Date().toISOString(),
    route,
    task,
    tier,
    model,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    cacheHit: false,
    latencyMs: Date.now() - startedAt,
    note,
  };
}
