import type { DigestFilter, FilingCategory, Materiality, StockMeta } from '@/types/finn';

// ---------------------------------------------------------------------------
// Portfolio: 16 names across sectors and sizes, plus 4 ad-hoc research names.
// Display tickers follow the build spec; `yahoo`/`screener` carry live symbols for
// names that changed after listing (Tata Motors PV demerger, Zomato -> Eternal).
// ---------------------------------------------------------------------------

export const PORTFOLIO: StockMeta[] = [
  { ticker: 'RELIANCE', name: 'Reliance Industries', sector: 'Conglomerate', yahoo: ['RELIANCE'], screener: ['RELIANCE'] },
  { ticker: 'TCS', name: 'Tata Consultancy Services', sector: 'IT Services', yahoo: ['TCS'], screener: ['TCS'] },
  { ticker: 'HDFCBANK', name: 'HDFC Bank', sector: 'Private Bank', yahoo: ['HDFCBANK'], screener: ['HDFCBANK'] },
  { ticker: 'INFY', name: 'Infosys', sector: 'IT Services', yahoo: ['INFY'], screener: ['INFY'] },
  {
    ticker: 'TATAMOTORS',
    name: 'Tata Motors (PV)',
    sector: 'Auto',
    yahoo: ['TMPV', 'TATAMOTORS'],
    screener: ['TMPV', 'TATAMOTORS'],
    note: 'Demerged Oct-2025; passenger-vehicle entity now trades as TMPV',
  },
  { ticker: 'SUNPHARMA', name: 'Sun Pharmaceutical', sector: 'Pharma', yahoo: ['SUNPHARMA'], screener: ['SUNPHARMA'] },
  { ticker: 'LT', name: 'Larsen & Toubro', sector: 'Engineering', yahoo: ['LT'], screener: ['LT'] },
  { ticker: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'NBFC', yahoo: ['BAJFINANCE'], screener: ['BAJFINANCE'] },
  { ticker: 'MARUTI', name: 'Maruti Suzuki', sector: 'Auto', yahoo: ['MARUTI'], screener: ['MARUTI'] },
  { ticker: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', yahoo: ['BHARTIARTL'], screener: ['BHARTIARTL'] },
  { ticker: 'TITAN', name: 'Titan Company', sector: 'Consumer', yahoo: ['TITAN'], screener: ['TITAN'] },
  { ticker: 'ULTRACEMCO', name: 'UltraTech Cement', sector: 'Cement', yahoo: ['ULTRACEMCO'], screener: ['ULTRACEMCO'] },
  { ticker: 'DRREDDY', name: "Dr. Reddy's Laboratories", sector: 'Pharma', yahoo: ['DRREDDY'], screener: ['DRREDDY'] },
  { ticker: 'TRENT', name: 'Trent', sector: 'Retail', yahoo: ['TRENT'], screener: ['TRENT'] },
  { ticker: 'KPITTECH', name: 'KPIT Technologies', sector: 'Auto Software', yahoo: ['KPITTECH'], screener: ['KPITTECH'] },
  {
    ticker: 'ZOMATO',
    name: 'Eternal (Zomato)',
    sector: 'Internet',
    yahoo: ['ETERNAL', 'ZOMATO'],
    screener: ['ETERNAL', 'ZOMATO'],
    note: 'Renamed Eternal Ltd in 2025; trades as ETERNAL',
  },
];

export const ADHOC: StockMeta[] = [
  { ticker: 'HAL', name: 'Hindustan Aeronautics', sector: 'Defence', yahoo: ['HAL'], screener: ['HAL'] },
  { ticker: 'POLYCAB', name: 'Polycab India', sector: 'Wires & Cables', yahoo: ['POLYCAB'], screener: ['POLYCAB'] },
  { ticker: 'INDHOTEL', name: 'Indian Hotels', sector: 'Hospitality', yahoo: ['INDHOTEL'], screener: ['INDHOTEL'] },
  { ticker: 'DEEPAKNTR', name: 'Deepak Nitrite', sector: 'Chemicals', yahoo: ['DEEPAKNTR'], screener: ['DEEPAKNTR'] },
];

export const ALL_STOCKS: StockMeta[] = [...PORTFOLIO, ...ADHOC];

/** Live-search suggestions for names outside the demo set. */
export const SEARCH_EXAMPLES = ['ITC', 'BEL', 'TITAN', 'IRCTC'];

export function findStock(ticker: string): StockMeta | undefined {
  const t = ticker.trim().toUpperCase();
  return ALL_STOCKS.find((s) => s.ticker === t || s.yahoo.includes(t) || s.screener.includes(t));
}

/** Normalise user input into an NSE symbol (keeps &, - which Screener uses, e.g. M&M, BAJAJ-AUTO). */
export function normaliseTicker(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/, '')
    .replace(/[^A-Z0-9&-]/g, '')
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// The 17 announcement categories from the Reference PDF, with the default
// materiality FINN assigns before any rule-level adjustment.
// ---------------------------------------------------------------------------

export interface CategoryDef {
  key: FilingCategory;
  label: string;
  definition: string;
  baseScore: number;
  defaultMateriality: Materiality;
  filter: DigestFilter | null;
}

export const CATEGORY_DEFS: Record<FilingCategory, CategoryDef> = {
  results: {
    key: 'results',
    label: 'Results',
    definition:
      'Quarterly/annual results, the board meeting approving them, results decks and shareholder letters, and ads confirming results were published.',
    baseScore: 90,
    defaultMateriality: 'high',
    filter: 'results',
  },
  'M&A': {
    key: 'M&A',
    label: 'M&A',
    definition: 'Any acquisition, merger, demerger, or joint venture, including investing in a subsidiary or selling a stake in one.',
    baseScore: 85,
    defaultMateriality: 'high',
    filter: 'deals',
  },
  fund_raise: {
    key: 'fund_raise',
    label: 'Fund raise',
    definition: 'Raising money from outside investors: rights issues, QIPs, preferential allotments, buybacks, or debt like commercial paper.',
    baseScore: 70,
    defaultMateriality: 'high',
    filter: 'deals',
  },
  management_change: {
    key: 'management_change',
    label: 'Mgmt change',
    definition: 'Any change at the top: a CEO, CFO, MD, or director joining, resigning, or retiring.',
    baseScore: 82,
    defaultMateriality: 'high',
    filter: 'mgmt',
  },
  litigation: {
    key: 'litigation',
    label: 'Litigation',
    definition: 'Lawsuits, regulatory orders, fines, warnings, or insolvency/restructuring proceedings.',
    baseScore: 72,
    defaultMateriality: 'high',
    filter: 'risk',
  },
  insider_trading: {
    key: 'insider_trading',
    label: 'Insider trade',
    definition: 'A promoter or insider buying/selling their own personal shareholding.',
    baseScore: 50,
    defaultMateriality: 'medium',
    filter: 'risk',
  },
  earnings_call: {
    key: 'earnings_call',
    label: 'Earnings call',
    definition: 'Anything about the investor conference call: the notice, the transcript, or the recording link.',
    baseScore: 28,
    defaultMateriality: 'routine',
    filter: null,
  },
  investor_meetings: {
    key: 'investor_meetings',
    label: 'Investor meet',
    definition: 'One-on-one or small-group meetings with specific investors/funds, or attending an investor conference.',
    baseScore: 15,
    defaultMateriality: 'routine',
    filter: null,
  },
  credit_rating: {
    key: 'credit_rating',
    label: 'Credit rating',
    definition: 'A rating agency assigning, upgrading, downgrading, or reaffirming a credit rating.',
    baseScore: 45,
    defaultMateriality: 'medium',
    filter: 'risk',
  },
  dividend: {
    key: 'dividend',
    label: 'Dividend',
    definition: 'A cash dividend being declared, with its record date.',
    baseScore: 45,
    defaultMateriality: 'medium',
    filter: null,
  },
  bonus_split: {
    key: 'bonus_split',
    label: 'Bonus/Split',
    definition: 'A bonus issue or stock split: share count changes but no cash comes to you.',
    baseScore: 55,
    defaultMateriality: 'medium',
    filter: null,
  },
  capex: {
    key: 'capex',
    label: 'Capex',
    definition: 'Approving spend on a new plant, facility, or capacity expansion.',
    baseScore: 72,
    defaultMateriality: 'high',
    filter: 'deals',
  },
  press_release: {
    key: 'press_release',
    label: 'Press release',
    definition: 'General news (order wins, new products, partnerships, rumour clarifications) not covered by another category.',
    baseScore: 48,
    defaultMateriality: 'medium',
    filter: null,
  },
  postal_ballot: {
    key: 'postal_ballot',
    label: 'Postal ballot',
    definition: 'Shareholders voting by postal ballot: the notice and the result.',
    baseScore: 18,
    defaultMateriality: 'routine',
    filter: null,
  },
  agm_egm: {
    key: 'agm_egm',
    label: 'AGM/EGM',
    definition: 'Annual or Extraordinary General Meeting: the notice and the result.',
    baseScore: 18,
    defaultMateriality: 'routine',
    filter: null,
  },
  pledging: {
    key: 'pledging',
    label: 'Pledging',
    definition: 'A promoter pledging, releasing, or changing the pledge status of shares.',
    baseScore: 70,
    defaultMateriality: 'high',
    filter: 'risk',
  },
  unclassified: {
    key: 'unclassified',
    label: 'Routine',
    definition:
      "Routine, low-relevance paperwork (ESOP allotments, compliance certificates, ESG reports, auditor appointments) that doesn't materially move the stock.",
    baseScore: 5,
    defaultMateriality: 'routine',
    filter: null,
  },
};

/** Score at or above which a filing surfaces in the feed; below it is buried in the routine tray. */
export const MATERIAL_SCORE = 40;

export const DIGEST_FILTERS: { key: DigestFilter; label: string }[] = [
  { key: 'all', label: 'All Material' },
  { key: 'results', label: 'Results' },
  { key: 'mgmt', label: 'Mgmt Change' },
  { key: 'deals', label: 'M&A / Capex' },
  { key: 'risk', label: 'Risk' },
];

export const WINDOW_HOURS: Record<'24h' | '3d' | '7d', number> = { '24h': 24, '3d': 72, '7d': 168 };

// ---------------------------------------------------------------------------
// Financial glossary (Reference PDF sections 2-5, in plain English).
// ---------------------------------------------------------------------------

export interface GlossaryTerm {
  term: string;
  group: 'Documents' | 'Headline numbers' | 'Balance sheet & cash' | 'Corporate actions & market';
  definition: string;
  /** Extra search keys. */
  keys?: string[];
  /** How FINN uses it, where relevant. */
  inFinn?: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  // Documents
  {
    term: 'Annual Report (AR)',
    group: 'Documents',
    definition:
      "A company's yearly disclosure: business overview, management discussion, audited financial statements (P&L, balance sheet, cash-flow), notes and the auditor's report. The single richest primary source.",
    keys: ['ar', 'annual report'],
  },
  {
    term: 'Quarterly results',
    group: 'Documents',
    definition: 'The financial results a company publishes every quarter, filed with the exchanges. Less detailed than the annual report but far more current.',
  },
  {
    term: 'Concall / earnings-call transcript',
    group: 'Documents',
    definition: 'A quarterly call where management discusses results and answers analysts. The transcript is where you find guidance, tone, and what analysts are pressing on.',
    keys: ['concall', 'transcript', 'earnings call'],
    inFinn: 'Narrative vs. Numbers reads these transcripts (Flash extracts guidance; Pro judges it against reported numbers).',
  },
  {
    term: 'Investor presentation',
    group: 'Documents',
    definition: 'A slide deck management releases (often with results) framing strategy, KPIs and segment performance in their own words.',
    keys: ['ppt', 'deck'],
  },
  {
    term: 'Exchange filing / announcement',
    group: 'Documents',
    definition: 'Any disclosure a listed company files with NSE/BSE: the raw feed the push side monitors.',
    keys: ['filing', 'announcement'],
  },
  {
    term: 'screener.in',
    group: 'Documents',
    definition: "A widely-used site consolidating a company's annual reports, concall transcripts and standardised multi-year financials in one place.",
    keys: ['screener'],
  },
  {
    term: 'Primary vs. secondary data',
    group: 'Documents',
    definition:
      'Primary data comes straight from the company (filings, reports, transcripts). Secondary data is commentary on it (news, broker notes). FINN pull-side analysis uses primary data only.',
    keys: ['primary', 'secondary'],
  },
  // Headline numbers
  {
    term: 'Revenue',
    group: 'Headline numbers',
    definition: 'Total sales: the top line of the P&L; the money coming in from selling goods/services.',
    keys: ['sales', 'top line'],
  },
  {
    term: 'EBITDA',
    group: 'Headline numbers',
    definition:
      'Earnings Before Interest, Tax, Depreciation & Amortisation. A rough proxy for operating profitability, before financing and accounting effects.',
    inFinn: 'FINN uses Screener\'s "Operating Profit" (Sales minus Expenses) as EBITDA; for lenders it is "Financing Profit".',
  },
  {
    term: 'PBT',
    group: 'Headline numbers',
    definition: 'Profit Before Tax: profit after all costs and interest but before income tax.',
    keys: ['profit before tax'],
  },
  {
    term: 'PAT',
    group: 'Headline numbers',
    definition: 'Profit After Tax: the bottom line, what\'s left for shareholders after tax. Also called "net profit".',
    keys: ['net profit', 'profit after tax'],
  },
  {
    term: 'Margin',
    group: 'Headline numbers',
    definition: 'A profit figure as a % of revenue (e.g. EBITDA margin = EBITDA ÷ revenue). Shows how much of each rupee of sales becomes profit.',
    keys: ['opm', 'ebitda margin', 'operating margin'],
  },
  {
    term: 'QoQ',
    group: 'Headline numbers',
    definition: 'Quarter-on-quarter: this quarter compared with the immediately previous quarter.',
    keys: ['quarter on quarter'],
  },
  {
    term: 'YoY',
    group: 'Headline numbers',
    definition: 'Year-on-year: this quarter compared with the same quarter a year earlier. The usual way to strip out seasonality.',
    keys: ['year on year'],
  },
  // Balance sheet & cash
  {
    term: 'Balance sheet',
    group: 'Balance sheet & cash',
    definition: "A snapshot of what a company owns (assets) and owes (liabilities) at a point in time, plus shareholders' equity.",
  },
  {
    term: 'Debt / leverage',
    group: 'Balance sheet & cash',
    definition: 'Money the company has borrowed. Leverage describes how much debt it carries relative to equity or earnings; more debt means more risk.',
    keys: ['borrowings', 'leverage', 'debt'],
  },
  {
    term: 'Debt-to-Equity (D/E)',
    group: 'Balance sheet & cash',
    definition: "Total debt ÷ shareholders' equity. Higher means more reliance on borrowing.",
    keys: ['d/e', 'debt to equity'],
    inFinn: 'Computed as Borrowings ÷ (Equity Capital + Reserves) from the latest balance sheet. Not meaningful for banks/NBFCs, whose debt is their raw material.',
  },
  {
    term: 'Working-capital cycle',
    group: 'Balance sheet & cash',
    definition:
      'Cash tied up in day-to-day operations: inventory plus money owed by customers, minus money owed to suppliers. A lengthening cycle can quietly drain cash.',
    keys: ['working capital', 'wc days', 'cash conversion cycle'],
    inFinn: 'FINN shows Screener\'s "Working Capital Days" and its 3-year change.',
  },
  {
    term: 'Cash flow',
    group: 'Balance sheet & cash',
    definition: 'Actual cash moving in and out, as opposed to accounting profit. "Cash from operations" (CFO) is the cash the core business generates.',
    keys: ['cfo', 'operating cash flow'],
  },
  {
    term: 'Cash conversion',
    group: 'Balance sheet & cash',
    definition: 'How well accounting profit turns into real cash. Persistent profit without matching cash flow is a red flag.',
    inFinn:
      'Cumulative CFO ÷ cumulative PAT over up to 5 years. ≥0.9× = High Conversion, 0.6-0.9× = Watch Working Capital, <0.6× = Red Flag.',
  },
  {
    term: 'Free cash flow (FCF)',
    group: 'Balance sheet & cash',
    definition: 'Cash from operations minus capital spending: the cash genuinely left over.',
    keys: ['fcf'],
  },
  {
    term: 'ROCE / ROE',
    group: 'Balance sheet & cash',
    definition: "Return on Capital Employed / Return on Equity: profit generated per rupee of capital / shareholders' money. Higher is generally better.",
    keys: ['roce', 'roe', 'return on equity', 'return on capital'],
  },
  {
    term: 'Contingent liabilities',
    group: 'Balance sheet & cash',
    definition: 'Potential future obligations (disputed taxes, guarantees) disclosed in the notes: not yet on the balance sheet but worth watching.',
  },
  {
    term: 'Related-party transactions (RPTs)',
    group: 'Balance sheet & cash',
    definition: 'Deals between the company and its own promoters/insiders or their other businesses. Legitimate, but a place to watch for value leaking out.',
    keys: ['rpt'],
  },
  {
    term: "Auditor's qualification",
    group: 'Balance sheet & cash',
    definition: 'When the auditor flags a concern about the accounts rather than signing off cleanly: a signal to dig deeper.',
  },
  // Corporate actions & market
  {
    term: 'NSE / BSE',
    group: 'Corporate actions & market',
    definition: "India's two main stock exchanges (National / Bombay Stock Exchange). Listed companies file their announcements here.",
  },
  {
    term: 'Ticker / symbol',
    group: 'Corporate actions & market',
    definition: "A stock's short code. On Yahoo Finance, Indian tickers add .NS (NSE) or .BO (BSE), e.g. RELIANCE.NS.",
  },
  {
    term: 'Market capitalisation',
    group: 'Corporate actions & market',
    definition: "Total market value of a company's shares (share price × number of shares). A rough measure of company size.",
    keys: ['market cap', 'mcap'],
  },
  {
    term: 'Promoter',
    group: 'Corporate actions & market',
    definition: 'The controlling shareholder / founding group of an Indian listed company.',
  },
  {
    term: 'Pledging',
    group: 'Corporate actions & market',
    definition: 'A promoter using their own shares as collateral for a loan. Heavy pledging is a risk signal.',
    keys: ['pledge', 'encumbrance'],
  },
  {
    term: 'Material announcement',
    group: 'Corporate actions & market',
    definition: 'A disclosure significant enough to potentially move the stock, as opposed to routine compliance paperwork.',
    inFinn: 'FINN scores every filing 0-100; scores below 40 are buried in the routine tray.',
  },
  {
    term: 'Guidance',
    group: 'Corporate actions & market',
    definition: "Management's own stated forward expectations for growth, margins, capex and so on.",
    inFinn: 'The Narrative vs. Numbers audit holds management to its own guidance.',
  },
  {
    term: 'Capex (capital expenditure)',
    group: 'Corporate actions & market',
    definition: 'Spending on long-term assets like new plants or capacity.',
    keys: ['capex'],
  },
  {
    term: 'Dividend',
    group: 'Corporate actions & market',
    definition: 'A cash payout to shareholders from profits.',
  },
  {
    term: 'Record date',
    group: 'Corporate actions & market',
    definition: "The cut-off date deciding who's eligible for a dividend, bonus, or split.",
  },
  {
    term: 'Bonus issue / stock split',
    group: 'Corporate actions & market',
    definition: 'Corporate actions that increase your share count without cash changing hands; each share is worth proportionally less.',
    keys: ['bonus', 'split'],
  },
  {
    term: 'Buyback',
    group: 'Corporate actions & market',
    definition: 'A company buying back its own shares from the market, usually returning surplus cash to shareholders.',
  },
  {
    term: 'Rights issue / QIP / preferential allotment',
    group: 'Corporate actions & market',
    definition:
      'Ways to raise fresh equity: from existing shareholders (rights), from institutions (QIP = Qualified Institutional Placement), or to specific investors (preferential allotment).',
    keys: ['qip', 'rights', 'preferential'],
  },
  {
    term: 'EOD (end-of-day)',
    group: 'Corporate actions & market',
    definition: 'Data taken after market close: the daily close price and traded volume used on the push side.',
    keys: ['eod', 'end of day'],
    inFinn: 'Triggers compare the last close vs. the prior close, and the last volume vs. the average of the previous 20 sessions.',
  },
];
