import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

// Two-level response cache: an in-process Map (fast, per serverless instance) backed by
// JSON files in the OS temp dir (survives hot reloads locally; /tmp on Vercel).
// Expired entries are kept so callers can serve stale data when a live source fails.

interface Entry<T = unknown> {
  exp: number;
  savedAt: number;
  value: T;
}

const MAX_MEM_ENTRIES = 400;
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const DIR = path.join(os.tmpdir(), 'finn-cache');

export function hashKey(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function fileFor(key: string): string {
  return path.join(DIR, `${hashKey(key)}.json`);
}

async function readEntry<T>(key: string): Promise<Entry<T> | undefined> {
  const m = mem.get(key) as Entry<T> | undefined;
  if (m) return m;
  try {
    const raw = await fs.readFile(fileFor(key), 'utf8');
    const e = JSON.parse(raw) as Entry<T>;
    mem.set(key, e);
    return e;
  } catch {
    return undefined;
  }
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const e = await readEntry<T>(key);
  return e && e.exp > Date.now() ? e.value : undefined;
}

/** Last good value even if expired (stale-if-error). */
export async function cacheGetStale<T>(key: string): Promise<{ value: T; savedAt: number } | undefined> {
  const e = await readEntry<T>(key);
  return e ? { value: e.value, savedAt: e.savedAt } : undefined;
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const e: Entry<T> = { exp: Date.now() + ttlMs, savedAt: Date.now(), value };
  mem.delete(key);
  mem.set(key, e);
  if (mem.size > MAX_MEM_ENTRIES) {
    const oldest = mem.keys().next().value;
    if (oldest !== undefined) mem.delete(oldest);
  }
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(fileFor(key), JSON.stringify(e));
  } catch {
    // Read-only or full filesystem: the memory layer still works.
  }
}

/**
 * Return a fresh cached value, or run `fn` once and cache it. Concurrent callers for the
 * same key share one in-flight promise, so 16 parallel requests never scrape a page twice.
 * Failures are not cached.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const hit = await cacheGet<T>(key);
  if (hit !== undefined) return { value: hit, hit: true };

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn()
      .then(async (v) => {
        await cacheSet(key, v, ttlMs);
        return v;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return { value: await p, hit: false };
}

export const TTL = {
  eod: 10 * 60_000,
  screener: 30 * 60_000,
  digest: 5 * 60_000,
  research: 30 * 60_000,
  llm: 7 * 24 * 60 * 60_000,
  transcript: 30 * 24 * 60 * 60_000,
} as const;
