'use client';

import type { CorporateFiling, SourceMode } from '@/types/finn';

// Browser-side helpers: tolerant fetch, per-viewer preferences, display heuristics.

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Unexpected response (${res.status})`);
  }
}

export function withSource(url: string, mode: SourceMode): string {
  if (mode !== 'seed') return url;
  return `${url}${url.includes('?') ? '&' : '?'}source=seed`;
}

/** localStorage can throw (private mode, blocked storage): preferences are a convenience only. */
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`finn:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`finn:${key}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}

const GENERIC_TITLE =
  /^(disclosure under regulation|announcement under|general updates?|updates?$|press release|board meeting outcome|outcome of board meeting|change in (management|directorate)|acquisition$|allotment$|retirement$|cessation$|resignation$|appointment$)/i;

/** Exchange subjects are often boilerplate; lead with the summary when the subject says nothing. */
export function headlineOf(f: Pick<CorporateFiling, 'title' | 'oneLiner'>): { headline: string; sub: string } {
  if (GENERIC_TITLE.test(f.title.trim()) && f.oneLiner) return { headline: f.oneLiner, sub: f.title };
  return { headline: f.title, sub: f.oneLiner && f.oneLiner !== f.title ? f.oneLiner : '' };
}

export function initials(name: string): string {
  return name
    .replace(/^(mr|ms|mrs|dr)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
