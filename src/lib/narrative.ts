import type { AuditBlock, AuditItem, AuditVerdict, ConcallDoc, ScreenerData, TelemetryEvent, ThesisPoint } from '@/types/finn';
import { TTL, cached } from './cache';
import { fetchBuffer, withDeadline } from './http';
import { callGemini, hasGemini, modelFor } from './llm';
import { compactFinancials, defaultAudit } from './research';
import { skippedEvent } from './telemetry';

// "Narrative vs. Numbers": the one place FINN pays for deep reasoning.
//   1. Flash (Tier 1) reads each concall transcript PDF once and extracts management's explicit
//      guidance into compact JSON. Cached for 30 days: a transcript never changes.
//   2. Pro (Tier 2) gets only those extracts + the reported numbers (~3-5k tokens, not 100+ pages)
//      and judges promised vs. delivered. If Pro cannot finish in time, Flash does the judging.

interface GuidanceExtract {
  callPeriod: string;
  quarterDiscussed: string;
  guidance: { topic: string; statement: string; horizon: string }[];
  reportedHighlights: string[];
  segments: { name: string; detail: string }[];
}

interface AuditReply {
  items?: Partial<AuditItem>[];
  guidance?: string[];
  summary?: string;
  bull?: ThesisPoint[];
  bear?: ThesisPoint[];
  segments?: { name: string; detail: string }[];
}

export interface NarrativeResult {
  audit: AuditBlock;
  thesis?: { bull: ThesisPoint[]; bear: ThesisPoint[] };
  segments?: { name: string; detail: string }[];
  model?: string;
  events: TelemetryEvent[];
}

const EXTRACT_SYSTEM = [
  "You read an Indian listed company's earnings-call transcript (PDF). Extract only what management said, not analysts.",
  'guidance: every explicit forward-looking statement on headline numbers: revenue/volume growth, margins, capex, capacity,',
  'order book, segment targets, timelines. Quote or closely paraphrase (max 35 words each) and keep the numbers exactly.',
  'horizon: the period it refers to (e.g. "FY27", "H2 FY27", "next 2-3 years", "by FY30").',
  'reportedHighlights: up to 4 headline facts management reported for the quarter just ended.',
  'segments: business segments with any revenue share or growth management gave.',
  'Return JSON: {"callPeriod":"","quarterDiscussed":"Q2 FY27","guidance":[{"topic":"","statement":"","horizon":""}],',
  '"reportedHighlights":[""],"segments":[{"name":"","detail":""}]}',
  'Use only the transcript. If there is no guidance, return an empty guidance array.',
].join('\n');

const AUDIT_SYSTEM = [
  'You are a sceptical buy-side analyst auditing management credibility. You hold management to its OWN words.',
  'Inputs: (1) guidance extracted from recent earnings calls, oldest first; (2) reported numbers (Rs crore).',
  'Rules:',
  '- Use ONLY the inputs. No outside knowledge, news, broker views or memory of the company.',
  '- For up to 5 of the most important promises, compare what was promised BEFORE a period with what that period delivered.',
  '- delivered must cite specific numbers from the reported table (growth %, margin %, Rs crore) or a later call that states the outcome.',
  '- verdict: "delivered" (met or beat), "divergent" (partly met, re-framed, or guidance quietly changed), "missed" (clearly short),',
  '  "pending" (period not yet reported). Guidance that was cut or raised mid-year is itself evidence: say so.',
  '- If a promise is in terms the table cannot verify (e.g. constant-currency, segment-level), check later calls; otherwise mark divergent and explain.',
  '- guidance: the current explicit guidance still on the record (max 4 lines).',
  '- bull / bear: exactly 3 each, each grounded in the numbers or the transcripts, with the evidence spelled out.',
  'Return JSON: {"items":[{"period":"Q1 FY27","topic":"","promised":"","promisedSource":"Q4 FY26 call (Apr 2026)","delivered":"",',
  '"verdict":"delivered","rationale":"one sentence"}],"guidance":[""],"summary":"two sentences on credibility",',
  '"bull":[{"point":"","evidence":""}],"bear":[{"point":"","evidence":""}],"segments":[{"name":"","detail":""}]}',
].join('\n');

const VERDICTS: AuditVerdict[] = ['delivered', 'divergent', 'missed', 'pending'];

function clip(s: unknown, n: number): string {
  const t = String(s ?? '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function sanitizeThesis(points: ThesisPoint[] | undefined): ThesisPoint[] {
  return (points ?? [])
    .filter((p) => p && p.point)
    .slice(0, 3)
    .map((p) => ({ point: clip(p.point, 120), evidence: clip(p.evidence, 220) }));
}

async function extractGuidance(
  ticker: string,
  call: ConcallDoc,
  route: string,
  deadline: number,
): Promise<{ extract: GuidanceExtract | null; events: TelemetryEvent[]; error?: string }> {
  const url = call.transcriptUrl!;
  const started = Date.now();
  try {
    const { value, hit } = await cached(`guidance:v1:${url}`, TTL.transcript, async () => {
      const fetchBudget = Math.min(25_000, deadline - Date.now() - 18_000);
      const { buf } = await withDeadline(fetchBuffer(url, { timeoutMs: Math.max(fetchBudget, 1), maxBytes: 15 * 1024 * 1024 }), fetchBudget, `fetch ${call.period} transcript`);
      const r = await callGemini<GuidanceExtract>({
        tier: 1,
        route,
        task: `${ticker}: extract guidance from ${call.period} concall`,
        system: EXTRACT_SYSTEM,
        parts: [{ inlineData: { mimeType: 'application/pdf', data: buf.toString('base64') } }, { text: `Company: ${ticker}. Call: ${call.period}.` }],
        cacheKey: `guidance-llm:v1:${url}`,
        timeoutMs: Math.max(5_000, Math.min(25_000, deadline - Date.now() - 12_000)),
      });
      return { extract: { ...r.data, callPeriod: r.data.callPeriod || call.period }, event: r.event };
    });
    const event: TelemetryEvent = hit
      ? { ...value.event, id: `${value.event.id}-hit-${started}`, at: new Date().toISOString(), costUsd: 0, inputTokens: 0, outputTokens: 0, cacheHit: true, latencyMs: Date.now() - started, note: 'transcript extract cached' }
      : value.event;
    return { extract: value.extract, events: [event] };
  } catch (e) {
    const error = clip((e as Error).message, 120);
    return { extract: null, error, events: [skippedEvent(route, `${ticker}: extract guidance from ${call.period} concall`, 1, modelFor(1), `skipped: ${error}`, started)] };
  }
}

export async function runNarrativeAudit(d: ScreenerData, route: string, deadline: number): Promise<NarrativeResult> {
  const base = defaultAudit(d);
  if (base.status === 'no-transcripts' || !hasGemini()) return { audit: base, events: [] };

  // One transcript per call period (Screener sometimes lists a second document for the same month).
  const seenPeriods = new Set<string>();
  const calls = d.concalls
    .filter((c) => c.transcriptUrl && !seenPeriods.has(c.period) && seenPeriods.add(c.period))
    .slice(0, 4);
  const extracted = await Promise.all(calls.map((c) => extractGuidance(d.ticker, c, route, deadline)));
  const events = extracted.flatMap((x) => x.events);
  const extracts = extracted
    .map((x) => x.extract)
    .filter((x): x is GuidanceExtract => Boolean(x))
    .reverse(); // oldest first, so the model reads the story in order

  if (!extracts.length) {
    const reason = extracted.find((x) => x.error)?.error ?? 'no transcript could be read';
    return { audit: { ...base, status: 'failed', note: `Could not read the transcripts (${reason}). Numbers are shown on their own; retry to resume from cache.` }, events };
  }

  const payload = JSON.stringify({
    guidanceByCall: extracts.map((x) => ({ call: x.callPeriod, quarterDiscussed: x.quarterDiscussed, guidance: x.guidance, reportedHighlights: x.reportedHighlights })),
    reported: compactFinancials(d),
  });
  const segmentsFromCalls = extracts[extracts.length - 1]?.segments ?? [];

  let reply: AuditReply | null = null;
  let model: string | undefined;
  for (const tier of [2, 1] as const) {
    const budget = deadline - Date.now() - 1_500;
    if (budget < 6_000) break;
    try {
      const r = await callGemini<AuditReply>({
        tier,
        route,
        task: `${d.ticker}: narrative vs numbers audit${tier === 1 ? ' (degraded to Flash)' : ''}`,
        system: AUDIT_SYSTEM,
        parts: [{ text: payload }],
        timeoutMs: budget,
        thinkingBudget: tier === 2 ? 2048 : 0,
      });
      events.push(r.event);
      reply = r.data;
      model = r.model;
      break;
    } catch (e) {
      events.push(skippedEvent(route, `${d.ticker}: narrative vs numbers audit`, tier, modelFor(tier), `${tier === 2 ? 'Pro' : 'Flash'} failed: ${clip((e as Error).message, 80)}`));
    }
  }

  if (!reply) {
    // Still useful: show the extracted guidance even though no verdicts could be produced.
    const guidance = extracts.flatMap((x) => x.guidance.map((g) => `${g.statement} (${x.callPeriod})`)).slice(-4);
    return { audit: { ...base, status: 'failed', guidance, note: 'Guidance was extracted but the audit model ran out of time. Retry to finish from cache.' }, events };
  }

  const items: AuditItem[] = (reply.items ?? [])
    .filter((i) => i && i.promised && i.delivered)
    .slice(0, 6)
    .map((i) => ({
      period: clip(i.period, 24),
      topic: clip(i.topic, 60),
      promised: clip(i.promised, 280),
      promisedSource: clip(i.promisedSource, 60),
      delivered: clip(i.delivered, 280),
      verdict: VERDICTS.includes(i.verdict as AuditVerdict) ? (i.verdict as AuditVerdict) : 'divergent',
      rationale: clip(i.rationale, 220),
    }));

  return {
    audit: {
      status: 'complete',
      items,
      guidance: (reply.guidance ?? []).map((g) => clip(g, 200)).slice(0, 4),
      summary: reply.summary ? clip(reply.summary, 400) : undefined,
      transcriptsUsed: calls
        .filter((_, k) => extracted[k].extract)
        .map((c) => ({ label: `Concall ${c.period}`, url: c.transcriptUrl!, kind: 'transcript' as const })),
    },
    thesis: reply.bull?.length && reply.bear?.length ? { bull: sanitizeThesis(reply.bull), bear: sanitizeThesis(reply.bear) } : undefined,
    segments: (reply.segments?.length ? reply.segments : segmentsFromCalls).slice(0, 6).map((s) => ({ name: clip(s.name, 50), detail: clip(s.detail, 160) })),
    model,
    events,
  };
}
