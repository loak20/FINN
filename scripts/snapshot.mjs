#!/usr/bin/env node
// Refresh FINN's offline seed snapshots from a running dev server.
//
//   terminal 1:  npm run dev
//   terminal 2:  npm run snapshot          (FINN_URL=http://localhost:3000 by default)
//
// Writes real data captured through the app's own scrapers into src/data/snapshots/:
//   screener.json  Screener.in extraction for every portfolio + ad-hoc ticker
//   market.json    Yahoo EOD items (live/cached only, never seed)
//   filings.json   classified BSE filings for the last 7 days (live/cached only)
// Tickers that fail keep their previous snapshot, so a flaky run never loses data.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.FINN_URL ?? 'http://localhost:3000';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'snapshots');

// Keep in sync with PORTFOLIO + ADHOC in src/config/portfolio.ts.
const TICKERS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'SUNPHARMA', 'LT', 'BAJFINANCE',
  'MARUTI', 'BHARTIARTL', 'TITAN', 'ULTRACEMCO', 'DRREDDY', 'TRENT', 'KPITTECH', 'ZOMATO',
  'HAL', 'POLYCAB', 'INDHOTEL', 'DEEPAKNTR',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function readExisting(file, fallback) {
  try {
    return JSON.parse(await readFile(path.join(OUT, file), 'utf8'));
  } catch {
    return fallback;
  }
}

async function save(file, data) {
  await writeFile(path.join(OUT, file), JSON.stringify(data, null, 1) + '\n');
  console.log(`  wrote src/data/snapshots/${file}`);
}

async function main() {
  console.log(`FINN snapshot from ${BASE}`);

  const screener = await readExisting('screener.json', {});
  let fresh = 0;
  for (const t of TICKERS) {
    try {
      const d = await getJson(`${BASE}/api/research/${t}?raw=1`);
      if (d && d.quarters && d.profitLoss) {
        screener[t] = d;
        fresh++;
        console.log(`  ✓ ${t.padEnd(11)} ${d.name}`);
      } else {
        console.log(`  ✗ ${t.padEnd(11)} ${d?.error ?? 'no data'} (keeping previous)`);
      }
    } catch (e) {
      console.log(`  ✗ ${t.padEnd(11)} ${e.message} (keeping previous)`);
    }
    await sleep(700); // be gentle with Screener.in
  }
  await save('screener.json', screener);

  try {
    const m = await getJson(`${BASE}/api/market-data`);
    const items = m.items.filter((i) => i.source !== 'seed');
    if (items.length) await save('market.json', { asOf: m.asOf, items });
    console.log(`  market: ${items.length} live/cached items`);
  } catch (e) {
    console.log(`  market snapshot skipped: ${e.message}`);
  }

  try {
    const a = await getJson(`${BASE}/api/announcements`);
    const filings = a.filings.filter((f) => f.source !== 'seed');
    if (filings.length) await save('filings.json', { asOf: a.asOf, filings });
    console.log(`  filings: ${filings.length} live/cached items`);
  } catch (e) {
    console.log(`  filings snapshot skipped: ${e.message}`);
  }

  console.log(`Done: ${fresh}/${TICKERS.length} Screener pages refreshed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
