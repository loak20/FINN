import type { CorporateFiling, ExecutiveBio, Materiality } from '@/types/finn';
import snapshot from './snapshots/filings.json';

// Real BSE announcements for the portfolio (via Screener.in), captured by `npm run snapshot`,
// already classified by the rules engine with Tier 0 results matrices attached.

const SNAP = snapshot as unknown as { asOf: string; filings: CorporateFiling[] };

export const SEED_FILINGS_AS_OF = SNAP.asOf;

/**
 * Executive bios for the management-change filings in the snapshot, keyed by filing id.
 * Read from each filing's Reg-30 annexure; where the annexure defers to an earlier intimation
 * (HDFC Bank), the background comes from the person's public profile and is marked `curated`.
 */
const BIOS: Record<string, ExecutiveBio> = {
  // HDFC Bank: change of MD & CEO (filed 27 Oct 2026)
  '5ea432deda8da17c': {
    person: 'Anup Bagchi',
    role: 'MD & CEO, from 27 Oct 2026',
    change: 'appointed',
    effective: '27 Oct 2026',
    summary:
      "Takes over from Sashidhar Jagdishan, who vacated office on 26 Oct 2026 on completing his tenure, having steered the HDFC–HDFC Bank merger. A career ICICI Group executive, he brings a retail-banking, broking and life-insurance background to India's largest private-sector bank.",
    career: [
      'MD & CEO, ICICI Prudential Life Insurance (from 2023)',
      'Executive Director, ICICI Bank (2017–2023)',
      'MD & CEO, ICICI Securities (2011–2017)',
      'Joined ICICI Group in 1992',
    ],
    education: 'IIT Kanpur; IIM Bangalore',
    source: 'curated',
  },
  // Trent: Chairman retires, board reshaped (filed 29 Oct 2026)
  '81e4433ff4abd138': {
    person: 'Bahram Vakil',
    role: 'Chairman, from 12 Nov 2026',
    change: 'appointed',
    effective: '12 Nov 2026',
    summary:
      'An existing board member, re-designated Chairman as Noel N. Tata retires under the Tata Group governance guidelines after 29 years with Trent (he becomes Chairman Emeritus). The board also inducts Rajiv Dube, ex-President of Tata Motors\' car business and nine years on the Aditya Birla group board, and lawyer Kalpana Merchant (45+ years in practice) as directors.',
    career: ['Founding partner, AZB & Partners (corporate law firm)', 'Director, Trent (before re-designation)'],
    source: 'curated',
  },
  // KPIT: Chairman joins the board of the material US subsidiary (filed 28 Oct 2026)
  '0b28365101c1d336': {
    person: 'Anant Talaulicar',
    role: 'Director, KPIT Technologies Inc. (US subsidiary)',
    change: 'appointed',
    effective: '28 Oct 2026',
    summary:
      "KPIT's independent Chairman joins the board of its material US subsidiary, as Regulation 24(1) requires. A governance step, not a change in the company's leadership.",
    career: [
      'Chairman & MD, Cummins Group in India (2004–2017)',
      'President, Cummins Inc. Components Group (2010–2014)',
      'Member, Cummins Inc. global leadership team (2009–2017)',
      'Managing Director, Tata Cummins (Cummins–Tata Motors JV)',
    ],
    education: 'BE Mechanical, Mysore University; Master\'s, University of Michigan; MBA, Tulane University',
    source: 'filing',
  },
};

/** Curated corrections where reading the filing changed the rules engine's verdict. */
const OVERRIDES: Record<string, { score: number; materiality: Materiality; oneLiner?: string }> = {
  '0b28365101c1d336': {
    score: 40,
    materiality: 'medium',
    oneLiner: 'Chairman Anant Talaulicar appointed to the board of KPIT US, a material subsidiary, under Reg 24(1).',
  },
};

/**
 * Build-time enrichment for a filing (bio, corrected score). Filing ids are stable hashes of
 * ticker + URL + timestamp, so the same corrections apply when these filings arrive live.
 */
export function applyCuratedEnrichment(f: CorporateFiling): CorporateFiling {
  const o = OVERRIDES[f.id];
  const bio = f.bio ?? BIOS[f.id];
  return o || bio ? { ...f, ...o, bio } : f;
}

/**
 * Seed filings re-timed so the snapshot moment lines up with `nowMs`: the 24h / 3d / 7d windows
 * stay meaningful offline. `originalFiledAt` keeps the real exchange timestamp for display.
 */
export function seedFilings(nowMs: number, tickers?: string[]): CorporateFiling[] {
  const shift = nowMs - Date.parse(SNAP.asOf);
  const move = (iso: string) => new Date(Date.parse(iso) + shift).toISOString();
  return SNAP.filings
    .filter((f) => !tickers || tickers.includes(f.ticker))
    .map((f) => ({
      ...f,
      ...OVERRIDES[f.id],
      bio: f.bio ?? BIOS[f.id],
      source: 'seed' as const,
      originalFiledAt: f.filedAt,
      filedAt: move(f.filedAt),
      related: f.related?.map((r) => ({ ...r, filedAt: move(r.filedAt) })),
    }));
}
