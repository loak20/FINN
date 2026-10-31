// Shared contract between the API routes and the mobile UI.

export type DataSource = 'live' | 'cache' | 'seed';
export type ModelTier = 0 | 1 | 2;
export type TimeWindow = '24h' | '3d' | '7d';
export type SourceMode = 'auto' | 'seed';

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export interface StockMeta {
  /** Display ticker used across the app (NSE symbol as listed in the build spec). */
  ticker: string;
  name: string;
  sector: string;
  /** Yahoo symbols to try in order (without the .NS suffix). Handles renames, e.g. ZOMATO -> ETERNAL. */
  yahoo: string[];
  /** Screener.in slugs to try in order. */
  screener: string[];
  /** Shown when the listed symbol has changed since the portfolio was defined. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Push B: EOD price & volume
// ---------------------------------------------------------------------------

export interface EODMarketItem {
  ticker: string;
  /** Resolved Yahoo symbol, e.g. TMPV.NS */
  symbol: string;
  name: string;
  sector: string;
  close: number;
  prevClose: number;
  changePct: number;
  volume: number;
  /** Average of up to 20 sessions before the last bar. */
  avgVolume20: number;
  volumeMultiple: number;
  /** Recent closes, oldest first (sparkline). */
  closes: number[];
  /** ISO timestamp of the last bar. */
  asOf: string;
  source: DataSource;
}

export interface LlmStatus {
  enabled: boolean;
  flash: string;
  pro: string;
}

export interface MarketDataResponse {
  items: EODMarketItem[];
  asOf: string;
  coverage: { live: number; cache: number; seed: number };
  llm: LlmStatus;
  telemetry: TelemetryEvent[];
}

// ---------------------------------------------------------------------------
// Push A: corporate filings
// ---------------------------------------------------------------------------

export type FilingCategory =
  | 'results'
  | 'M&A'
  | 'fund_raise'
  | 'management_change'
  | 'litigation'
  | 'insider_trading'
  | 'earnings_call'
  | 'investor_meetings'
  | 'credit_rating'
  | 'dividend'
  | 'bonus_split'
  | 'capex'
  | 'press_release'
  | 'postal_ballot'
  | 'agm_egm'
  | 'pledging'
  | 'unclassified';

export type Materiality = 'high' | 'medium' | 'routine';
export type DigestFilter = 'all' | 'results' | 'mgmt' | 'deals' | 'risk';

export interface ResultsMetricRow {
  metric: 'Revenue' | 'EBITDA' | 'PBT' | 'PAT';
  current: number | null;
  prevQuarter: number | null;
  yearAgo: number | null;
  qoqPct: number | null;
  yoyPct: number | null;
}

export interface ResultsTable {
  period: string;
  prevPeriod: string;
  yearAgoPeriod: string;
  basis: 'Consolidated' | 'Standalone';
  /** Screener labels operating profit "Financing Profit" for lenders. */
  ebitdaLabel: string;
  rows: ResultsMetricRow[];
  marginTakeaway: string;
  source: 'screener' | 'filing-llm';
  /** True when the filing is for a newer quarter than the structured table we could find. */
  stale?: boolean;
  note?: string;
}

export interface ExecutiveBio {
  person: string;
  role: string;
  change: 'appointed' | 'resigned' | 'retired' | 'redesignated' | 'other';
  effective?: string;
  summary: string;
  career: string[];
  education?: string;
  /** filing = the Reg-30 annexure; llm = Flash extraction; curated = filing facts + public profile, compiled at build time. */
  source: 'filing' | 'llm' | 'curated';
}

export interface RelatedFiling {
  title: string;
  filedAt: string;
  url?: string;
}

export interface CorporateFiling {
  id: string;
  ticker: string;
  company: string;
  title: string;
  detail: string;
  filedAt: string;
  url?: string;
  category: FilingCategory;
  materiality: Materiality;
  /** 0-100 priority used for ordering. */
  score: number;
  oneLiner: string;
  classifiedBy: 'rules' | 'flash';
  results?: ResultsTable;
  bio?: ExecutiveBio;
  /** Same-event filings folded under this one (board outcome + results + deck + press release). */
  related?: RelatedFiling[];
  source: DataSource;
  /** Seed filings are re-timed to the current clock; this keeps the real exchange timestamp. */
  originalFiledAt?: string;
}

export interface AnnouncementsResponse {
  filings: CorporateFiling[];
  /** Reference clock for the 24h/3d/7d windows (snapshot time for seed data). */
  asOf: string;
  mode: 'live' | 'seed' | 'mixed';
  coverage: { live: string[]; seed: string[] };
  telemetry: TelemetryEvent[];
}

export type EnrichAction = 'extract-results' | 'extract-bio';

export interface EnrichRequest {
  action: EnrichAction;
  filing: Pick<CorporateFiling, 'id' | 'ticker' | 'title' | 'detail' | 'url' | 'filedAt'>;
}

export interface EnrichResponse {
  ok: boolean;
  results?: ResultsTable;
  bio?: ExecutiveBio;
  error?: string;
  telemetry: TelemetryEvent[];
}

// ---------------------------------------------------------------------------
// Pull: Screener extraction + research report
// ---------------------------------------------------------------------------

export interface FinTable {
  headers: string[];
  /** Row label (normalised, e.g. "Sales", "Net Profit") -> values aligned with headers. */
  rows: Record<string, (number | null)[]>;
}

export interface ConcallDoc {
  period: string;
  transcriptUrl?: string;
  pptUrl?: string;
  recordingUrl?: string;
}

export interface AnnualReportDoc {
  year: string;
  url: string;
}

export interface ScreenerAnnouncement {
  title: string;
  detail: string;
  filedAt: string;
  url: string;
}

export interface ScreenerData {
  ticker: string;
  slug: string;
  name: string;
  url: string;
  basis: 'Consolidated' | 'Standalone';
  about: string;
  keyPoints: string;
  topRatios: Record<string, string>;
  quarters: FinTable;
  /** Screener "Raw PDF" link per quarter column (primary results filing). */
  quarterPdfs: (string | null)[];
  profitLoss: FinTable;
  balanceSheet: FinTable;
  cashFlow: FinTable;
  ratios: FinTable;
  growth: Record<string, Record<string, string>>;
  concalls: ConcallDoc[];
  annualReports: AnnualReportDoc[];
  announcements: ScreenerAnnouncement[];
  isFinancial: boolean;
  fetchedAt: string;
}

export interface SnapshotMetric {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tone?: 'pos' | 'neg' | 'warn' | 'neutral';
  /** Glossary term this metric links to. */
  term?: string;
}

export interface TrajectoryPoint {
  period: string;
  revenue: number | null;
  pat: number | null;
  opm: number | null;
}

export type CashBadge = 'High Conversion' | 'Watch Working Capital' | 'Red Flag' | 'Not Meaningful';

export interface CashQuality {
  years: string[];
  cfo: (number | null)[];
  pat: (number | null)[];
  fcf: (number | null)[];
  conversion: number | null;
  fcfCumulative: number | null;
  badge: CashBadge;
  explanation: string;
}

export type AuditVerdict = 'delivered' | 'divergent' | 'missed' | 'pending';
export type AuditStatus = 'complete' | 'seed' | 'queued' | 'needs-key' | 'no-transcripts' | 'failed';

export interface AuditItem {
  /** Period whose numbers are being judged, e.g. "Q2 FY27" or "FY26". */
  period: string;
  topic: string;
  promised: string;
  /** Where the promise was made, e.g. "Q4 FY26 concall (Apr 2026)". */
  promisedSource: string;
  delivered: string;
  verdict: AuditVerdict;
  rationale: string;
}

export interface AuditBlock {
  status: AuditStatus;
  items: AuditItem[];
  /** Current explicit guidance lines. */
  guidance: string[];
  summary?: string;
  transcriptsUsed: SourceLink[];
  note?: string;
}

export interface ThesisPoint {
  point: string;
  evidence: string;
}

export interface SourceLink {
  label: string;
  url: string;
  kind: 'screener' | 'annual_report' | 'transcript' | 'presentation' | 'filing';
}

export interface QuarterSeries {
  periods: string[];
  revenue: (number | null)[];
  opm: (number | null)[];
  pat: (number | null)[];
}

export interface PullResearchReport {
  ticker: string;
  name: string;
  asOf: string;
  basis: 'Consolidated' | 'Standalone';
  isFinancial: boolean;
  price?: number;
  marketCapCr?: number;
  pe?: number;
  sources: SourceLink[];
  provenance: {
    financials: DataSource;
    narrative: DataSource | 'none';
    narrativeModel?: string;
  };
  business: {
    overview: string;
    keyPoints: string[];
    segments: { name: string; detail: string }[];
  };
  snapshot: SnapshotMetric[];
  trajectory: TrajectoryPoint[];
  trajectoryNote: string;
  quarters: QuarterSeries;
  cash: CashQuality;
  audit: AuditBlock;
  thesis: { bull: ThesisPoint[]; bear: ThesisPoint[]; source: 'llm' | 'rules' | 'seed' };
  /** core = deterministic modules only; deep = narrative audit attempted. */
  stage: 'core' | 'deep';
}

export type ResearchResponse =
  | { ok: true; report: PullResearchReport; telemetry: TelemetryEvent[] }
  | { ok: false; ticker: string; error: string; suggestions: string[]; telemetry: TelemetryEvent[] };

export interface AskResponse {
  answer: string;
  citations: string[];
  tier: ModelTier;
  telemetry: TelemetryEvent[];
}

// ---------------------------------------------------------------------------
// Smart router telemetry
// ---------------------------------------------------------------------------

export interface TelemetryEvent {
  id: string;
  at: string;
  route: string;
  task: string;
  tier: ModelTier;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cacheHit: boolean;
  latencyMs: number;
  note?: string;
}
