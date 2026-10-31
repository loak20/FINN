import type { ModelTier } from '@/types/finn';

// Smart model routing: what runs where, and what it costs. Shared by the server
// (cost accounting) and the telemetry drawer (explaining the rules to the user).

export const DEFAULT_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_PRO_MODEL = 'gemini-2.5-pro';

/** USD per 1M tokens (Gemini API paid tier, <=200k prompt). Thinking tokens bill as output. */
export const PRICING_PER_MTOK: Record<1 | 2, { input: number; output: number }> = {
  1: { input: 0.3, output: 2.5 },
  2: { input: 1.25, output: 10 },
};

export interface TierRule {
  tier: ModelTier;
  name: string;
  model: string;
  why: string;
  tasks: string[];
}

export const ROUTING_RULES: TierRule[] = [
  {
    tier: 0,
    name: 'Tier 0 · Deterministic',
    model: 'No model · $0',
    why: 'Anything a formula, a regex or a table lookup can answer never touches a model.',
    tasks: [
      'EOD % change and 20-day volume multiple (Yahoo chart API)',
      'Threshold slider filtering, live in the browser',
      'cheerio extraction of Screener tables, filings and concall links',
      'Rules classifier across the 17 filing categories',
      'Results QoQ/YoY matrix from structured quarterly tables',
      'Cash conversion, D/E, working-capital and CAGR math',
      'Rules-based bull/bear and Q&A when no key is configured',
      'Memory + /tmp response cache, stale-if-error',
    ],
  },
  {
    tier: 1,
    name: 'Tier 1 · Bulk extraction',
    model: DEFAULT_FLASH_MODEL,
    why: 'High-volume, low-ambiguity reading. Thinking disabled, JSON-only output.',
    tasks: [
      'Classifying filings the rules engine is unsure about (batched)',
      'Results headline numbers from a filing PDF when tables lag',
      'Executive bio from the appointment annexure',
      'Guidance extraction from each concall transcript (one call per transcript, cached forever)',
      'Scoped Q&A against scraped tables and extracted guidance',
    ],
  },
  {
    tier: 2,
    name: 'Tier 2 · Deep reasoning',
    model: DEFAULT_PRO_MODEL,
    why: 'Only where judgement is the product: holding management to its own words.',
    tasks: ['Narrative vs. Numbers audit across the last four quarters', 'Grounded bull vs. bear built on that audit'],
  },
];

export function estimateCost(tier: 1 | 2, inputTokens: number, outputTokens: number): number {
  const p = PRICING_PER_MTOK[tier];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
