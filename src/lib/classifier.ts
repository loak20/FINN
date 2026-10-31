import { CATEGORY_DEFS } from '@/config/portfolio';
import type { FilingCategory, Materiality } from '@/types/finn';

// Tier 0 rules classifier. BSE subjects are formulaic ("Announcement under Regulation 30
// (LODR)-Change in Directorate") and Screener adds a one-line summary, so ordered rules
// settle most filings for $0. Only low-confidence fall-throughs are sent to Flash.

export interface Classification {
  category: FilingCategory;
  score: number;
  confidence: 'high' | 'low';
  hint?: string;
}

export interface ClassifyContext {
  /** Lenders raise NCDs/CP as routine funding; for them it is not a material "fund raise". */
  isLender?: boolean;
}

interface Ctx {
  title: string;
  detail: string;
  all: string;
  isLender: boolean;
}

interface Rule {
  category: FilingCategory;
  test: RegExp;
  /** Match against the subject only (more reliable than the summary). */
  titleOnly?: boolean;
  /** Extra condition beyond the regex. */
  when?: (c: Ctx) => boolean;
  score?: (c: Ctx) => number;
  confidence?: 'high' | 'low';
  hint?: string;
}

const RESULT_WORDS =
  /\b(financial results?|results? for the (quarter|year|period|half)|quarter(ly)? results?|q[1-4](\/h[12])?\s?fy\s?'?\d{2}|unaudited|audited|(approved|declared|announced|reported)[^.]{0,40}\bresults?)\b/;
const BOARD_OUTCOME = /outcome of (the )?board meeting|board meeting outcome/;
const IS_RESULTS = (c: Ctx) => RESULT_WORDS.test(c.all);

/** Rupee amount mentioned in a filing, in crore (lakh -> /100). */
function amountCr(text: string): number | null {
  const m = text.match(/(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d+)?)\s?(lakh|lac|crore|cr\b|million|billion|bn\b)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const unit = m[2];
  if (unit.startsWith('la')) return n / 100;
  if (unit === 'million') return n / 10;
  if (unit === 'billion' || unit === 'bn') return n * 100;
  return n;
}

const RULES: Rule[] = [
  // --- Routine paperwork first: these titles are unambiguous noise. ---
  { category: 'unclassified', titleOnly: true, test: /trading window/, hint: 'Trading-window notice' },
  { category: 'unclassified', titleOnly: true, test: /74\s?\(5\)|depositories and participants/, hint: 'Depository compliance certificate' },
  { category: 'unclassified', test: /loss of share certificate|duplicate share|issue of duplicate|transmission of shares/, hint: 'Share-certificate admin' },
  { category: 'unclassified', titleOnly: true, test: /esop|esos|esps|employee stock|stock option/, hint: 'ESOP allotment' },
  { category: 'unclassified', test: /business responsibility|brsr|\besg\b|sustainability report|corporate dossier/, hint: 'ESG / corporate dossier' },
  {
    category: 'unclassified',
    titleOnly: true,
    test: /compliance certificate|reg(ulation)?\.?\s?40\(9\)|secretarial compliance|investor complaints|statement of deviation|reg(ulation)?\.?\s?(57|61)/,
    when: (c) => !RESULT_WORDS.test(c.title),
    hint: 'Compliance certificate',
  },
  {
    category: 'unclassified',
    titleOnly: true,
    test: /appointment of (statutory|secretarial|internal|cost) auditors?/,
    when: (c) => !RESULT_WORDS.test(c.title),
    hint: 'Auditor appointment',
  },
  { category: 'unclassified', titleOnly: true, test: /record date.*(interest|redemption)|payment of interest|interest payment/, hint: 'Debt-servicing notice' },
  { category: 'unclassified', test: /strike[- ]off|letter of comfort/, titleOnly: true, hint: 'Subsidiary housekeeping' },

  // Newspaper ads repeat something already filed.
  { category: 'results', titleOnly: true, test: /newspaper|publication/, when: IS_RESULTS, score: () => 12, hint: 'Results newspaper ad' },
  { category: 'postal_ballot', titleOnly: true, test: /newspaper|publication/, when: (c) => /postal ballot|e-?voting/.test(c.all), score: () => 8, hint: 'Postal-ballot newspaper ad' },
  { category: 'unclassified', titleOnly: true, test: /newspaper|publication/, score: () => 6, hint: 'Newspaper publication' },

  // --- Results family: the filing itself outranks decks, reviews and intimations. ---
  { category: 'results', titleOnly: true, test: /limited review/, score: () => 30, hint: 'Auditor limited-review report' },
  {
    category: 'results',
    titleOnly: true,
    test: /board meeting intimation|intimation of board meeting|prior intimation/,
    score: (c) => (RESULT_WORDS.test(c.all) ? 30 : 22),
    hint: 'Results date intimation',
  },
  {
    category: 'results',
    titleOnly: true,
    test: /(investor|analyst|earnings|results) presentation|shareholder letter/,
    score: (c) => (RESULT_WORDS.test(c.all) ? 55 : 42),
  },
  { category: 'results', titleOnly: true, test: /integrated filing.*financial|financial results?|results? for the (quarter|year|period|half)/, score: () => 92 },
  { category: 'results', titleOnly: true, test: BOARD_OUTCOME, when: IS_RESULTS, score: () => 86 },

  // --- Earnings call & investor meetings (context, low materiality). ---
  { category: 'earnings_call', titleOnly: true, test: /transcript|audio recording|earnings call|conference call|con-?call|investor call|video recording/ },
  { category: 'investor_meetings', titleOnly: true, test: /analyst|investor meet|institutional investor|investor conference|investors? meeting|non-deal roadshow/ },

  // --- Ownership & insider activity (before M&A: SAST disclosures mention "acquisition"). ---
  { category: 'pledging', test: /pledge|encumbrance|reg(ulation)?\.?\s?31\b/, score: (c) => (/release|revoc/.test(c.all) ? 55 : 78) },
  { category: 'insider_trading', test: /\bsast\b|reg(ulation)?\.?\s?29|reg(ulation)?\.?\s?7\s?\(2\)|insider trading|prohibition of insider|\bpit\b|inter-?se transfer/ },

  // --- Ratings before capital raising: "rating on NCDs" is a rating action, not a raise. ---
  {
    category: 'credit_rating',
    test: /credit rating|rating action|crisil|\bicra\b|care ratings|india ratings|moody|fitch|s&p global/,
    score: (c) => (/downgrad|negative|watch with/.test(c.all) ? 80 : /upgrad|positive/.test(c.all) ? 58 : 26),
  },

  // --- People. ---
  {
    category: 'management_change',
    test: /change in (directorate|management|kmp)|appointment|appointed|resignation|resigns|steps? down|cessation|re-?appointment|retire|key managerial|chief (executive|financial|operating|technology)|managing director|whole[- ]time director|\b(ceo|cfo|coo)\b|company secretary/,
    score: (c) => {
      if (/\b(ceo|cfo|coo)\b|chief (executive|financial|operating)|managing director|chairman|chairperson|whole[- ]time director/.test(c.all)) return 88;
      if (/company secretary|compliance officer/.test(c.all)) return 44;
      if (/independent director|non-executive/.test(c.all)) return 52;
      return 66;
    },
  },

  // --- Deals and capital. ---
  {
    category: 'M&A',
    test: /acquisition|acquire|amalgamation|merger|demerger|scheme of arrangement|joint venture|\bjv\b|divest|stake sale|sale of stake|subsidiar/,
    score: (c) => {
      if (/acqui|merger|amalgamation|demerger|joint venture|stake/.test(c.detail)) return 85;
      // A newly incorporated or struck-off subsidiary is housekeeping, not a deal.
      if (/subsidiar|incorporat|strike[- ]off/.test(c.detail)) return 42;
      return 72;
    },
  },
  {
    category: 'fund_raise',
    test: /raising of funds|fund rais|\bqip\b|qualified institution|preferential|rights issue|buy-?back|issue of securities|non-convertible debenture|\bncds?\b|commercial paper|bonds?\b|allotment/,
    score: (c) => {
      if (/buy-?back|qip|rights issue|preferential/.test(c.all)) return 80;
      if (c.isLender) return 22; // NCD/CP issuance is a lender's day job
      return 55;
    },
  },
  { category: 'bonus_split', test: /\bbonus\b|stock split|sub-?division|split of (equity )?shares/, score: () => 62 },
  { category: 'dividend', test: /dividend/ },
  {
    category: 'capex',
    test: /capacity expansion|\bcapex\b|capital expenditure|commissioning|commercial production|commencement of (commercial )?(operations|production)|new (plant|facility|manufacturing)|greenfield|brownfield|expansion of [^.]{0,40}(cent(er|re)|campus|plant|facility|capacity)/,
    score: (c) => (/cent(er|re)|campus/.test(c.all) ? 45 : CATEGORY_DEFS.capex.baseScore),
  },

  // --- Order wins and clean inspections before litigation ("order received" is usually good news). ---
  {
    category: 'press_release',
    test: /award of order|receipt of order|order (win|worth|valued|received)|bagged|secures? (an? )?(order|contract)|wins? (an? )?(order|contract)|contract (award|win)|letter of (award|intent)|purchase order/,
    score: () => 64,
    hint: 'Order win',
  },
  {
    category: 'press_release',
    test: /zero observations|nil observations|no observations|establishment inspection report|\beir\b|\bvai\b|\bnai\b|inspection[^.]{0,40}clos/,
    score: () => 62,
    hint: 'Regulatory inspection closed',
  },

  // --- Risk. ---
  {
    category: 'litigation',
    test: /litigation|dispute|regulatory action|penalt|show cause|demand (order|notice)|tax demand|\bgst\b|income[- ]tax|order (passed )?(by|from) the (hon|court|tribunal|commissioner|authority|assessing|adjudicating|appellate)|tribunal|\bnclt\b|\bnclat\b|court|arbitra|warning letter|import alert|form 483|observations|insolvency|\bsebi\b.*order/,
    score: (c) => {
      if (/warning letter|import alert|insolvency/.test(c.all)) return 88;
      if (/no (material|significant) (impact|effect)|not material|immaterial/.test(c.all)) return 30;
      const cr = amountCr(c.all);
      if (cr !== null) return cr < 1 ? 25 : cr < 50 ? 45 : 76;
      return 66;
    },
  },

  // --- General news. ---
  { category: 'press_release', test: /usfda|us fda|\bfda\b|drug approval|\banda\b/, score: () => 58, hint: 'US FDA update' },
  {
    category: 'press_release',
    test: /press release|media release|launch|partnership|collaborat|agreement|\bmou\b|clarification|rumou?r/,
    score: (c) => (RESULT_WORDS.test(c.all) ? 58 : 50),
  },

  // --- Shareholder meetings. ---
  { category: 'postal_ballot', test: /postal ballot|e-?voting|scrutini[sz]er/ },
  { category: 'agm_egm', test: /annual general meeting|\bagm\b|\begm\b|extra-?ordinary general meeting|book closure|shareholders? meeting/ },

  // --- Generic Reg-30 "Updates": real but ambiguous; Flash decides. ---
  { category: 'press_release', titleOnly: true, test: /general updates?|-updates?$|\bupdates?\b/, score: () => 42, confidence: 'low' },
];

export function materialityOf(score: number): Materiality {
  if (score >= 75) return 'high';
  if (score >= 40) return 'medium';
  return 'routine';
}

export function classifyFiling(title: string, detail: string, ctx: ClassifyContext = {}): Classification {
  const c: Ctx = { title: title.toLowerCase(), detail: detail.toLowerCase(), all: '', isLender: Boolean(ctx.isLender) };
  c.all = `${c.title} ${c.detail}`;

  for (const rule of RULES) {
    if (!rule.test.test(rule.titleOnly ? c.title : c.all)) continue;
    if (rule.when && !rule.when(c)) continue;

    if (rule.category === 'press_release' && /press release|media release/.test(c.title)) {
      // A press release that is really about the quarter belongs in the results cluster;
      // one announcing an uploaded transcript or recording is earnings-call logistics.
      if (/transcript|audio recording|video recording/.test(c.detail)) return { category: 'earnings_call', score: 28, confidence: 'high' };
      if (RESULT_WORDS.test(c.all)) return { category: 'results', score: 60, confidence: 'high', hint: 'Results press release' };
    }

    const score = rule.score ? rule.score(c) : CATEGORY_DEFS[rule.category].baseScore;
    return { category: rule.category, score, confidence: rule.confidence ?? 'high', hint: rule.hint };
  }
  return { category: 'unclassified', score: 10, confidence: 'low' };
}

/** Category-level fallback summary when the exchange gives no description. */
export function defaultOneLiner(category: FilingCategory, hint?: string): string {
  if (hint) return hint;
  switch (category) {
    case 'results':
      return 'Results filing.';
    case 'management_change':
      return 'Change in board or key management.';
    case 'earnings_call':
      return 'Earnings call logistics or transcript.';
    case 'investor_meetings':
      return 'Scheduled analyst / investor interaction.';
    case 'unclassified':
      return 'Routine compliance paperwork.';
    default:
      return CATEGORY_DEFS[category].definition;
  }
}
