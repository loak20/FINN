// Fetch helpers with hard timeouts, per-host rate-limit backoff and bounded concurrency.

const UA = 'Mozilla/5.0';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// When a host answers 429/403 we stop calling it for a while instead of hammering it;
// callers fall straight through to cache/seed during the cool-down.
const blockedUntil = new Map<string, number>();
const COOL_DOWN_MS = 90_000;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function isHostBlocked(url: string): boolean {
  return (blockedUntil.get(hostOf(url)) ?? 0) > Date.now();
}

export interface FetchOpts extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 8000, headers, ...rest } = opts;
  const host = hostOf(url);
  if (isHostBlocked(url)) throw new HttpError(429, `${host} cooling down after rate limit`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      headers: { 'User-Agent': UA, ...(headers as Record<string, string> | undefined) },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (res.status === 429 || res.status === 403) blockedUntil.set(host, Date.now() + COOL_DOWN_MS);
    return res;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new HttpError(408, `Timed out after ${timeoutMs}ms: ${host}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchBuffer(url: string, opts: FetchOpts & { maxBytes?: number } = {}): Promise<{ buf: Buffer; contentType: string }> {
  const { maxBytes = 12 * 1024 * 1024, ...rest } = opts;
  const res = await fetchWithTimeout(url, rest);
  if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len && len > maxBytes) throw new HttpError(413, `Document too large (${len} bytes)`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new HttpError(413, `Document too large (${buf.length} bytes)`);
  return { buf, contentType: res.headers.get('content-type') ?? '' };
}

/** Map with at most `limit` promises in flight; preserves input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Reject if `p` has not settled within `ms`. */
export function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return Promise.reject(new HttpError(408, `${label}: no time budget left`));
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new HttpError(408, `${label}: timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
