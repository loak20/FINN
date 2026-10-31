import { DEFAULT_FLASH_MODEL, DEFAULT_PRO_MODEL, estimateCost } from '@/config/routing';
import type { LlmStatus, TelemetryEvent } from '@/types/finn';
import { TTL, cacheGet, cacheSet, hashKey } from './cache';
import { HttpError, fetchWithTimeout } from './http';
import { newEventId } from './telemetry';

// Gemini over plain REST (no SDK): Tier 1 = Flash for bulk extraction, Tier 2 = Pro for
// the narrative audit. Every call is cached by prompt hash, so a repeated question or a
// re-opened report costs $0 the second time.

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export type LlmTier = 1 | 2;

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface LlmCall {
  tier: LlmTier;
  route: string;
  task: string;
  system: string;
  parts: GeminiPart[];
  /** Ask for application/json and parse it (default true). */
  json?: boolean;
  timeoutMs?: number;
  /** Flash defaults to 0 (no thinking); Pro defaults to a capped budget. */
  thinkingBudget?: number;
  maxOutputTokens?: number;
  /** Stable cache key; defaults to a hash of the prompt. */
  cacheKey?: string;
  cacheTtlMs?: number;
}

export interface LlmResult<T> {
  data: T;
  text: string;
  model: string;
  event: TelemetryEvent;
}

function apiKey(): string | undefined {
  const k = process.env.GEMINI_API_KEY?.trim();
  return k ? k : undefined;
}

export function hasGemini(): boolean {
  return Boolean(apiKey());
}

function modelChain(tier: LlmTier): string[] {
  const pinned = tier === 1 ? process.env.GEMINI_FLASH_MODEL?.trim() || DEFAULT_FLASH_MODEL : process.env.GEMINI_PRO_MODEL?.trim() || DEFAULT_PRO_MODEL;
  const alias = tier === 1 ? 'gemini-flash-latest' : 'gemini-pro-latest';
  return pinned === alias ? [pinned] : [pinned, alias];
}

export function llmStatus(): LlmStatus {
  return { enabled: hasGemini(), flash: modelChain(1)[0], pro: modelChain(2)[0] };
}

export function modelFor(tier: LlmTier): string {
  return modelChain(tier)[0];
}

/** Pull the first JSON object/array out of a model reply (tolerates code fences and preamble). */
export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error('Model reply was not valid JSON');
  }
}

/** Gemini errors arrive as JSON ({ error: { message } }); keep only the human-readable part. */
async function errorText(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    return (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw.slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

function partFingerprint(p: GeminiPart): string {
  return 'text' in p ? p.text : `${p.inlineData.mimeType}:${hashKey(p.inlineData.data)}`;
}

interface GeminiReply {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  error?: { message?: string };
}

export async function callGemini<T = unknown>(c: LlmCall): Promise<LlmResult<T>> {
  const key = apiKey();
  if (!key) throw new Error('GEMINI_API_KEY is not configured');

  const wantJson = c.json !== false;
  const cacheKey = `llm:${c.tier}:${c.cacheKey ?? hashKey(c.system + '\n' + c.parts.map(partFingerprint).join('\n'))}`;
  const started = Date.now();

  const hit = await cacheGet<{ text: string; model: string }>(cacheKey);
  if (hit) {
    return {
      data: (wantJson ? parseJsonLoose<T>(hit.text) : hit.text) as T,
      text: hit.text,
      model: hit.model,
      event: {
        id: newEventId(),
        at: new Date().toISOString(),
        route: c.route,
        task: c.task,
        tier: c.tier,
        model: hit.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        cacheHit: true,
        latencyMs: Date.now() - started,
        note: 'served from LLM cache',
      },
    };
  }

  const thinkingBudget = c.thinkingBudget ?? (c.tier === 1 ? 0 : 1024);
  let lastErr: unknown;

  for (const model of modelChain(c.tier)) {
    // Newer model aliases may reject an explicit thinking budget; retry once without it.
    for (const withThinking of [true, false]) {
      const body = {
        systemInstruction: { parts: [{ text: c.system }] },
        contents: [{ role: 'user', parts: c.parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: c.maxOutputTokens ?? (c.tier === 2 ? 8192 : 4096),
          ...(wantJson ? { responseMimeType: 'application/json' } : {}),
          ...(withThinking ? { thinkingConfig: { thinkingBudget } } : {}),
        },
      };

      let res: Response;
      try {
        res = await fetchWithTimeout(`${API}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
          timeoutMs: c.timeoutMs ?? 30_000,
        });
      } catch (e) {
        lastErr = e;
        break; // network/timeout: do not burn the remaining budget on a second model
      }

      if (res.status === 404) {
        lastErr = new HttpError(404, `Model ${model} is not available`);
        break; // try the next model in the chain
      }
      if (res.status === 400 && withThinking) {
        const msg = await errorText(res);
        if (/thinking/i.test(msg)) continue;
        throw new HttpError(400, `Gemini 400: ${msg}`);
      }
      if (!res.ok) {
        throw new HttpError(res.status, `Gemini ${res.status}: ${await errorText(res)}`);
      }

      const reply = (await res.json()) as GeminiReply;
      const cand = reply.candidates?.[0];
      const text = (cand?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('')
        .trim();
      if (!text) throw new Error(`Gemini returned no text (finishReason: ${cand?.finishReason ?? 'unknown'})`);

      const u = reply.usageMetadata ?? {};
      const inputTokens = u.promptTokenCount ?? 0;
      const outputTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
      const data = (wantJson ? parseJsonLoose<T>(text) : text) as T;

      await cacheSet(cacheKey, { text, model }, c.cacheTtlMs ?? TTL.llm);

      return {
        data,
        text,
        model,
        event: {
          id: newEventId(),
          at: new Date().toISOString(),
          route: c.route,
          task: c.task,
          tier: c.tier,
          model,
          inputTokens,
          outputTokens,
          costUsd: estimateCost(c.tier, inputTokens, outputTokens),
          cacheHit: false,
          latencyMs: Date.now() - started,
          note: model === modelChain(c.tier)[0] ? undefined : 'pinned model unavailable, served by rolling alias',
        },
      };
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Gemini call failed');
}
