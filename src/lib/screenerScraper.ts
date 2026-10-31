import { load, type CheerioAPI } from 'cheerio';
import { findStock } from '@/config/portfolio';
import type { DataSource, FinTable, ScreenerData } from '@/types/finn';
import { TTL, cacheGetStale, cached } from './cache';
import { HttpError, fetchText } from './http';

// cheerio scraper for https://www.screener.in/company/<SYMBOL>/consolidated/ with a
// standalone fallback. Pure Tier 0: one HTML page yields the P&L, balance sheet,
// cash flow, ratios, concall/annual-report links and recent BSE announcements.

const BASE = 'https://www.screener.in';

export class TickerNotFoundError extends Error {
  constructor(public ticker: string) {
    super(`No Screener.in page found for ${ticker}`);
    this.name = 'TickerNotFoundError';
  }
}

function clean(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanLabel(s: string): string {
  return clean(s).replace(/\s*\+$/, '').trim();
}

export function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.replace(/[,₹%\s ]/g, '');
  if (!t || t === '-' || t === '--') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function abs(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith('http')) return href;
  return `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

function parseTable($: CheerioAPI, sectionId: string): { table: FinTable; pdfs: (string | null)[] } {
  const table = $(`section#${sectionId} table.data-table`).first();
  const headers = table
    .find('thead th')
    .toArray()
    .map((th) => clean($(th).text()))
    .slice(1);

  const rows: Record<string, (number | null)[]> = {};
  let pdfs: (string | null)[] = [];

  table.find('tbody tr').each((_, tr) => {
    const tds = $(tr).find('td').toArray();
    if (tds.length < 2) return;
    const label = cleanLabel($(tds[0]).text());
    if (!label) return;
    if (label === 'Raw PDF') {
      pdfs = tds.slice(1).map((td) => abs($(td).find('a').attr('href')) ?? null);
      return;
    }
    // Note: cheerio's .map() drops nulls, so build arrays from toArray() to keep columns aligned.
    rows[label] = tds.slice(1).map((td) => parseNum($(td).text()));
  });

  return { table: { headers, rows }, pdfs };
}

function parseRanges($: CheerioAPI): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  $('section#profit-loss table.ranges-table').each((_, t) => {
    const title = clean($(t).find('th').first().text());
    if (!title) return;
    const kv: Record<string, string> = {};
    $(t)
      .find('tr')
      .each((__, tr) => {
        const tds = $(tr).find('td').toArray();
        if (tds.length === 2) kv[clean($(tds[0]).text()).replace(/:$/, '')] = clean($(tds[1]).text());
      });
    out[title] = kv;
  });
  return out;
}

export function parseScreenerHtml(html: string, ticker: string, slug: string, requestedBasis: 'Consolidated' | 'Standalone'): ScreenerData {
  const $ = load(html);

  const title = clean($('title').text());
  const name = clean($('h1').first().text()) || title.split(' share price')[0] || ticker;

  const subText = clean($('section#quarters p.sub').first().text());
  const basis: 'Consolidated' | 'Standalone' = /standalone figures/i.test(subText) ? 'Standalone' : /consolidated figures/i.test(subText) ? 'Consolidated' : requestedBasis;

  const about = clean($('.company-profile .about').first().text());
  const keyPoints = clean($('.company-profile .commentary').first().text().replace(/\[\d+\]/g, ''));

  const topRatios: Record<string, string> = {};
  $('#top-ratios li').each((_, li) => {
    const k = clean($(li).find('.name').text());
    const v = clean($(li).find('.value').text());
    if (k) topRatios[k] = v;
  });

  const q = parseTable($, 'quarters');
  const pl = parseTable($, 'profit-loss');
  const bs = parseTable($, 'balance-sheet');
  const cf = parseTable($, 'cash-flow');
  const ra = parseTable($, 'ratios');

  const concalls: ScreenerData['concalls'] = [];
  const seen = new Set<string>();
  $('.documents.concalls li').each((_, li) => {
    const period = clean($(li).find('div').first().text());
    const doc: ScreenerData['concalls'][number] = { period };
    $(li)
      .find('a')
      .each((__, a) => {
        const label = clean($(a).text()).toLowerCase();
        const href = abs($(a).attr('href'));
        if (!href) return;
        if (label === 'transcript' || $(a).attr('title') === 'Raw Transcript') doc.transcriptUrl = href;
        else if (label === 'ppt') doc.pptUrl = href;
        else if (label === 'rec') doc.recordingUrl = href;
      });
    const key = `${period}|${doc.transcriptUrl ?? ''}|${doc.pptUrl ?? ''}`;
    if (period && !seen.has(key)) {
      seen.add(key);
      concalls.push(doc);
    }
  });

  const annualReports: ScreenerData['annualReports'] = [];
  $('.documents.annual-reports li').each((_, li) => {
    const a = $(li).find('a').first();
    const href = abs(a.attr('href'));
    const label = clean(a.text());
    const year = label.match(/(19|20)\d{2}/)?.[0];
    if (href && year) annualReports.push({ year, url: href });
  });

  const announcements: ScreenerData['announcements'] = [];
  $('#company-announcements-tab li').each((_, li) => {
    const a = $(li).find('a').first();
    const url = abs(a.attr('href'));
    const meta = a.find('div').first();
    const filedAt = meta.find('time').attr('datetime');
    const timeText = clean(meta.find('time').text());
    const detail = clean(meta.text()).replace(timeText, '').replace(/^\s*-\s*/, '').trim();
    const titleText = clean(a.clone().children().remove().end().text());
    if (url && filedAt && titleText) {
      announcements.push({ title: titleText, detail, filedAt: new Date(filedAt).toISOString(), url });
    }
  });

  const qLabels = Object.keys(q.table.rows);
  const isFinancial = qLabels.includes('Financing Profit') || (!qLabels.includes('Sales') && qLabels.includes('Revenue')) || 'Deposits' in bs.table.rows;

  return {
    ticker,
    slug,
    name,
    url: `${BASE}/company/${slug}/${basis === 'Consolidated' ? 'consolidated/' : ''}`,
    basis,
    about,
    keyPoints,
    topRatios,
    quarters: q.table,
    quarterPdfs: q.pdfs,
    profitLoss: pl.table,
    balanceSheet: bs.table,
    cashFlow: cf.table,
    ratios: ra.table,
    growth: parseRanges($),
    concalls,
    annualReports,
    announcements,
    isFinancial,
    fetchedAt: new Date().toISOString(),
  };
}

function hasUsableFinancials(d: ScreenerData): boolean {
  const revenue = d.quarters.rows['Sales'] ?? d.quarters.rows['Revenue'];
  return d.quarters.headers.length >= 3 && Boolean(revenue?.some((v) => v !== null));
}

async function scrapeLive(ticker: string): Promise<ScreenerData> {
  const slugs = findStock(ticker)?.screener ?? [ticker];
  let lastErr: unknown = new TickerNotFoundError(ticker);

  for (const slug of slugs) {
    const path = `${BASE}/company/${encodeURIComponent(slug)}`;
    try {
      const html = await fetchText(`${path}/consolidated/`, { timeoutMs: 9000, headers: { Accept: 'text/html' } });
      const consolidated = parseScreenerHtml(html, ticker, slug, 'Consolidated');
      if (hasUsableFinancials(consolidated)) return consolidated;

      // Some companies only report standalone numbers.
      const html2 = await fetchText(`${path}/`, { timeoutMs: 9000, headers: { Accept: 'text/html' } });
      const standalone = parseScreenerHtml(html2, ticker, slug, 'Standalone');
      if (hasUsableFinancials(standalone)) return standalone;
      lastErr = new TickerNotFoundError(ticker);
    } catch (e) {
      lastErr = e instanceof HttpError && e.status === 404 ? new TickerNotFoundError(ticker) : e;
      if (!(e instanceof HttpError && e.status === 404)) break;
    }
  }
  throw lastErr;
}

/**
 * Cached Screener extraction. Shared by the digest (announcements) and research routes so a
 * page is scraped at most once per TTL. On failure, serves the last good copy if one exists.
 */
export async function getScreenerData(ticker: string): Promise<{ data: ScreenerData; source: DataSource }> {
  const key = `screener:${ticker}`;
  try {
    const { value, hit } = await cached(key, TTL.screener, () => scrapeLive(ticker));
    return { data: value, source: hit ? 'cache' : 'live' };
  } catch (e) {
    if (e instanceof TickerNotFoundError) throw e;
    const stale = await cacheGetStale<ScreenerData>(key);
    if (stale) return { data: stale.value, source: 'cache' };
    throw e;
  }
}
