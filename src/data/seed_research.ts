import type { AuditBlock, ScreenerData, SourceLink, ThesisPoint } from '@/types/finn';
import snapshot from './snapshots/screener.json';

// Offline research fallback.
// 1. SEED_SCREENER: real Screener.in extractions for the 20 demo tickers (captured by
//    `npm run snapshot`). The same Tier 0 engine computes every module from them.
// 2. SEED_NARRATIVES: pre-computed Narrative vs. Numbers audits for five companies. Every
//    "promised" line is quoted from the linked concall transcript (BSE filings), every
//    "delivered" line from the reported numbers. Used when no GEMINI_API_KEY is configured
//    or the live audit cannot finish; replaced by the live Flash -> Pro audit otherwise.

const SCREENER = snapshot as unknown as Record<string, ScreenerData>;

export function seedScreener(ticker: string): ScreenerData | undefined {
  return SCREENER[ticker];
}

export function seedTickers(): string[] {
  return Object.keys(SCREENER);
}

export interface SeedNarrative {
  capturedAt: string;
  audit: AuditBlock;
  thesis: { bull: ThesisPoint[]; bear: ThesisPoint[] };
  segments: { name: string; detail: string }[];
}

const bse = (id: string) => `https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=${id}.pdf`;
const t = (label: string, id: string): SourceLink => ({ label, url: bse(id), kind: 'transcript' });

export const SEED_NARRATIVES: Record<string, SeedNarrative> = {
  INFY: {
    capturedAt: '2026-10-30',
    audit: {
      status: 'seed',
      items: [
        {
          period: 'FY26',
          topic: 'Revenue growth',
          promised: 'FY26 constant-currency growth within the upgraded guidance band set in January 2026.',
          promisedSource: 'Q3 FY26 call (Jan 2026), recapped Apr 2026',
          delivered: '"FY26 revenues crossed $20 bn and grew 3.1% in constant currency terms, within the upgraded guidance band." ₹1,78,650 Cr, +9.6% in rupees.',
          verdict: 'delivered',
          rationale: 'Landed inside the band management had already raised once.',
        },
        {
          period: 'Q1 FY27',
          topic: 'FY27 revenue guidance',
          promised: '"Our revenue growth guidance for the financial year 2027 is 1.5% to 3.5% growth year-on-year in constant currency terms."',
          promisedSource: 'Q4 FY26 call (Apr 2026)',
          delivered: 'Q1 FY27 revenue ₹48,211 Cr (+14.0% YoY in rupees, flattered by acquisitions and the currency), but volumes were "soft and weaker than expectations" and the band was cut to 1.5–3%.',
          verdict: 'divergent',
          rationale: 'The top of the range was removed one quarter after it was set; rupee growth hides the constant-currency reality.',
        },
        {
          period: 'Q2 FY27',
          topic: 'FY27 revenue guidance',
          promised: '"We are changing our revenue growth guidance to 1.5% to 3% Y-on-Y growth in constant currency terms."',
          promisedSource: 'Q1 FY27 call (Jul 2026)',
          delivered: 'Q2 FY27 revenue ₹49,244 Cr (+2.1% QoQ). Guidance cut again to 1–2% CC, "reflecting softer-than-expected H1 performance".',
          verdict: 'missed',
          rationale: 'Second consecutive cut: the midpoint fell from 2.5% to 1.5% in six months.',
        },
        {
          period: 'H1 FY27',
          topic: 'Operating margin band',
          promised: '"Our operating margin guidance for financial year \'27 is 20% to 22%."',
          promisedSource: 'Q4 FY26 call (Apr 2026)',
          delivered: '"For H1, operating margin stood at 21% at the midpoint of our guided range." EBITDA margin 23.7% in both Q1 and Q2 FY27.',
          verdict: 'delivered',
          rationale: 'The margin promise survived two growth cuts: cost levers are working even as demand disappoints.',
        },
      ],
      guidance: [
        'FY27 revenue growth 1%–2% YoY in constant currency (Oct 2026; cut from 1.5%–3%)',
        'FY27 operating margin 20%–22% (unchanged since Apr 2026)',
      ],
      summary:
        'Infosys keeps its margin promises but not its growth promises: the FY27 revenue band was cut twice (1.5–3.5% → 1.5–3% → 1–2%) while the 20–22% margin band held. Discount the top end of any new growth guidance.',
      transcriptsUsed: [
        t('Concall Oct 2026', '7982fc61-7765-4981-ab3d-6aec36ba2137'),
        t('Concall Jul 2026', '95f8af86-dc92-49dc-a7cf-ecce287f8cce'),
        t('Concall Apr 2026', '2ab7badf-388c-4dab-bfcc-3e128677734c'),
      ],
    },
    thesis: {
      bull: [
        { point: 'Margin promise kept through two growth cuts', evidence: 'H1 FY27 operating margin 21%, mid-point of the 20–22% band; EBITDA margin 23.4–24.1% in each of the last four quarters' },
        { point: 'Rupee earnings still compounding', evidence: 'FY26 revenue ₹1,78,650 Cr (+9.6%) and PAT ₹29,474 Cr (+10.2%); Q2 FY27 revenue +10.7% YoY in rupees' },
        { point: 'Inorganic levers are being pulled', evidence: 'FY27 guidance includes the Stratus acquisition; Versent JV and Optimum Healthcare deals pending (Apr 2026 call)' },
      ],
      bear: [
        { point: 'Growth guidance cut twice in six months', evidence: '1.5–3.5% (Apr) → 1.5–3% (Jul) → 1–2% (Oct 2026), all in constant currency' },
        { point: 'Weakness is pricing- and client-led', evidence: '0.75–1% hit from one large European manufacturing client (Apr); "softer increase in price" on client productivity demands (Jul)' },
        { point: 'Profit growth slowing to single digits', evidence: 'Q2 FY27 PAT ₹7,838 Cr, +6.3% YoY vs revenue +10.7%' },
      ],
    },
    segments: [],
  },

  POLYCAB: {
    capturedAt: '2026-10-30',
    audit: {
      status: 'seed',
      items: [
        {
          period: 'FY26',
          topic: 'Capex',
          promised: '"In-line with our Project Spring guidance of investing ₹12 billion to ₹16 billion annually through FY30." (9M FY26 capex: ₹10.9bn)',
          promisedSource: 'Q3 FY26 call (Jan 2026)',
          delivered: '"During FY26, we incurred capex of INR 14.8 billion, in line with our annual guidance of INR 12 billion to INR 16 billion per annum."',
          verdict: 'delivered',
          rationale: 'Spend landed inside the band without overshooting.',
        },
        {
          period: 'FY26',
          topic: 'EBITDA margin',
          promised: '"To refer to our Project Spring guidance, we\'ve given a long-term guidance of 11% to 13%."',
          promisedSource: 'Q3 FY26 call (Jan 2026)',
          delivered: 'FY26 EBITDA margin 13.9% (₹4,013 Cr on ₹28,884 Cr); Q2 FY27 14.4%.',
          verdict: 'delivered',
          rationale: 'Running at or above the top of the band; management now frames 12–14% as the near-to-mid-term range (May 2026).',
        },
        {
          period: 'H1 FY27',
          topic: 'Growth vs. industry',
          promised: '"We have always guided that we will do 1.5x of market growth, which is a mix of both volume and value."',
          promisedSource: 'Q1 FY27 call (Jul 2026)',
          delivered: 'Revenue +39.0% YoY in Q1 FY27 (₹8,210 Cr) and +52.8% in Q2 FY27 (₹9,899 Cr).',
          verdict: 'delivered',
          rationale: 'Far above any plausible industry rate, though industry growth itself is not in FINN\'s primary data, so the 1.5× multiple is inferred.',
        },
        {
          period: 'FY30',
          topic: 'FMEG profitability',
          promised: '"Remain on track to achieve our Project Spring targets of 1.5x - 2x industry growth and EBITDA margins in the range of 8% to 10% by FY30."',
          promisedSource: 'Q3 FY26 call (Jan 2026)',
          delivered: '"EBIT margins for the quarter were 8%, very much in line with the milestones laid out under Project Spring." (FMEG, Q1 FY27)',
          verdict: 'pending',
          rationale: 'A FY30 target that is on its glide path; segment margins are not in the consolidated table.',
        },
      ],
      guidance: [
        'EBITDA margin 11%–13% long term; 12%–14% near-to-mid term (Project Spring)',
        'Wires & cables growth at 1.5×–2× industry through FY30',
        'FMEG EBITDA margin 8%–10% by FY30',
        'Capex ₹12–16bn a year through FY30',
      ],
      summary:
        'Polycab has met every checkable Project Spring milestone: FY26 capex landed in-band and margins run above the 11–13% long-term range. The risk is the reverse of usual: guidance looks conservative, so watch for a margin reset rather than a miss.',
      transcriptsUsed: [
        t('Concall Oct 2026', '77b6d277-0ffc-440d-ba8a-2bd9bc3dc43e'),
        t('Concall Jul 2026', 'e47a217c-cefa-4ff6-8e34-6bbd07d42b13'),
        t('Concall May 2026', 'f66f17ac-c40f-4309-afca-3e66af0956a0'),
        t('Concall Jan 2026', 'c54bf2c3-22fa-45e1-bf1a-2194e7b46183'),
      ],
    },
    thesis: {
      bull: [
        { point: 'Growth has accelerated, not faded', evidence: 'Revenue +39.0% YoY in Q1 FY27 and +52.8% in Q2 FY27 (₹9,899 Cr); FY26 +28.9%' },
        { point: 'Margins above the guided band', evidence: 'FY26 EBITDA margin 13.9% vs 11–13% long-term guidance; Q2 FY27 14.4%' },
        { point: 'Capex discipline', evidence: 'FY26 capex ₹14.8bn, inside the ₹12–16bn annual band (May 2026 call)' },
      ],
      bear: [
        { point: 'Management still anchors to 11–13%', evidence: '"Long-term, we are still holding 11% to 13% range guidance" (Oct 2026): today\'s ~14% may not be the steady state' },
        { point: 'Quarterly margins are volatile', evidence: 'EBITDA margin 15.8% (Q2 FY26) → 12.6% (Q3 FY26) → 14.4% (Q2 FY27)' },
        { point: 'Growth keeps needing capital', evidence: 'Capex of ₹1,200–1,600 Cr a year through FY30 vs FY26 PAT of ₹2,708 Cr' },
      ],
    },
    segments: [
      { name: 'Wires & Cables', detail: 'Guided 1.5×–2× industry growth; 11–13% EBITDA margin long term' },
      { name: 'FMEG', detail: 'Q1 FY27 EBIT margin 8%; 8–10% EBITDA margin targeted by FY30' },
      { name: 'EPC (incl. BharatNet)', detail: 'Management guides high-single-digit margins' },
    ],
  },

  INDHOTEL: {
    capturedAt: '2026-10-30',
    audit: {
      status: 'seed',
      items: [
        {
          period: 'FY26',
          topic: 'Revenue growth',
          promised: '"We remain confident of delivering on our guidance of double-digit growth supported by sustained margins."',
          promisedSource: 'Q3 FY26 call (Feb 2026)',
          delivered: 'FY26 revenue ₹9,689 Cr, +16.2% YoY; EBITDA margin 33.0% vs 33.2% in FY25.',
          verdict: 'delivered',
          rationale: 'Double-digit growth with margins held flat, exactly as promised.',
        },
        {
          period: 'Q1 FY27',
          topic: 'FY27 growth guidance',
          promised: '"We will again deliver double-digit growth between 12%, let\'s say, and 14% in the FY \'27 fiscal."',
          promisedSource: 'Q4 FY26 call (May 2026)',
          delivered: 'Q1 FY27 revenue ₹2,339 Cr, +14.6% YoY; EBITDA margin 28.8% vs 28.2% a year earlier.',
          verdict: 'delivered',
          rationale: 'Top of the band in the seasonally weakest quarter.',
        },
        {
          period: 'Q2 FY27',
          topic: 'FY27 growth guidance',
          promised: 'FY27 growth of 12%–14% with "sustained margins, strong cash generation and improved quality of earnings".',
          promisedSource: 'Q1 FY27 call (Jul 2026)',
          delivered: 'Q2 FY27 revenue ₹2,484 Cr, +21.7% YoY; H1 +18.2%. EBITDA margin 28.4% vs 27.9%. Guidance raised to 15–17%.',
          verdict: 'delivered',
          rationale: 'Beat-and-raise: management upgraded the band by 300bps rather than sandbagging.',
        },
        {
          period: 'H2 FY27',
          topic: 'Upgraded FY27 guidance',
          promised: '"We are revising our full year growth guidance upwards to 15% to 17%", with the hotels segment at 17%–19%.',
          promisedSource: 'Q2 FY27 call (Oct 2026)',
          delivered: 'Not yet reported. With H1 at +18.2%, the 16% midpoint needs only ~14% growth in H2 (an analyst\'s arithmetic on the call).',
          verdict: 'pending',
          rationale: 'The bar sits below the H1 run-rate; slower TajSATS growth is the flagged swing factor.',
        },
      ],
      guidance: [
        'FY27 consolidated revenue growth 15%–17% (raised from 12%–14% in Oct 2026)',
        'Hotels segment growth 17%–19% in FY27',
        '"Positive outlook on margins" without a numeric target',
        'Capex ~₹1,000 Cr including routine, new and renovation (Feb 2026)',
      ],
      summary:
        'IHCL is a beat-and-raise story: FY26 double-digit growth arrived with flat margins, and FY27 guidance was raised 300bps after H1 ran at 18%. The upgraded band still sits below the H1 run-rate.',
      transcriptsUsed: [
        t('Concall Oct 2026', '6637aa17-2edd-4de3-b7c2-b855a48624f1'),
        t('Concall Jul 2026', 'e9041a34-064a-418c-a179-94cb08772f9d'),
        t('Concall May 2026', 'd8332278-c59c-497a-9eb4-235c90843d62'),
        t('Concall Feb 2026', '685b29d3-5355-4b0c-b42d-b7674636c342'),
      ],
    },
    thesis: {
      bull: [
        { point: 'Guidance raised, not trimmed', evidence: 'FY27 growth band 12–14% → 15–17% (Oct 2026) after H1 revenue +18.2%' },
        { point: 'Margins held while scaling', evidence: 'EBITDA margin 33.0% in FY26 vs 33.2% in FY25; Q2 FY27 28.4% vs 27.9% a year ago' },
        { point: 'Profit compounding', evidence: 'PAT ₹1,330 Cr (FY24) → ₹2,247 Cr (FY26), 1.7× in two years' },
      ],
      bear: [
        { point: 'TajSATS is lagging', evidence: '"We have to balance the hospitality growth with the somewhat slowness in the TajSATS" (Oct 2026)' },
        { point: 'No numeric margin guidance', evidence: '"A positive outlook on margins without giving a specific guidance on the numbers" (Oct 2026)' },
        { point: 'H2 carries the year', evidence: 'Q3 is seasonally largest (₹2,842 Cr in Q3 FY26 vs ₹2,041 Cr in Q2 FY26); the 16% midpoint needs ~14% H2 growth' },
      ],
    },
    segments: [
      { name: 'Hotels', detail: 'FY27 growth guided at 17–19% (Oct 2026)' },
      { name: 'TajSATS (air catering)', detail: 'Growing more slowly; flagged as the drag on consolidated growth (Oct 2026)' },
    ],
  },

  DEEPAKNTR: {
    capturedAt: '2026-10-30',
    audit: {
      status: 'seed',
      items: [
        {
          period: 'Q4 FY26',
          topic: 'Near-term recovery',
          promised: '"With this positive backdrop, the Group expects a favourable performance in Q4 FY26."',
          promisedSource: 'Q3 FY26 call (Feb 2026)',
          delivered: 'Q4 FY26 EBITDA ₹376 Cr vs ₹211 Cr in Q3; margin 17.7% vs 10.7%. Revenue ₹2,120 Cr (+7.3% QoQ, −2.8% YoY).',
          verdict: 'delivered',
          rationale: 'The margin recovery came through sharply, though revenue was still below the year-ago quarter.',
        },
        {
          period: 'Q4 FY26',
          topic: 'MIBK/MIBC commissioning',
          promised: '"The MIBK/ MIBC project is progressing well and is targeted for commissioning within this quarter."',
          promisedSource: 'Q3 FY26 call (Feb 2026)',
          delivered: 'By May 2026 the MIBK/MIBC and agro-intermediates projects were "scheduled for commissioning in Q2 FY27", about two quarters late.',
          verdict: 'missed',
          rationale: 'The timeline slipped ~6 months; earnings were rescued by margins, not the new capacity.',
        },
        {
          period: 'Q1 FY27',
          topic: 'FY27 margin profile',
          promised: '"In FY27, we expect a stronger margin profile, even for the standalone business, compared with FY26."',
          promisedSource: 'Q4 FY26 call (May 2026)',
          delivered: 'Q1 FY27 EBITDA margin 20.9% (₹540 Cr on ₹2,578 Cr) vs 12.5% for FY26; management reported a record ₹554 Cr EBITDA.',
          verdict: 'delivered',
          rationale: 'Margins jumped ~8pp over the FY26 average in the first quarter of the year.',
        },
        {
          period: 'Q2 FY27',
          topic: 'Sustaining the step-up',
          promised: '"Recently commissioned capacities, expanding downstream product offerings… provide multiple opportunity drivers for the quarters ahead."',
          promisedSource: 'Q1 FY27 call (Aug 2026)',
          delivered: 'Q2 FY27 revenue ₹3,076 Cr (+19.3% QoQ, +61.7% YoY); EBITDA margin 20.4%; PAT ₹398 Cr (+234% YoY).',
          verdict: 'delivered',
          rationale: 'A second straight quarter of ~20% margins on sharply higher revenue: the recovery is broadening.',
        },
      ],
      guidance: [
        'Stronger FY27 margin profile vs FY26, including standalone (May 2026)',
        'MIBK/MIBC and agro-intermediates commissioning in Q2 FY27 (moved from Q4 FY26)',
        'FY26 capex guidance was ~₹1,500 Cr (Nov 2025)',
      ],
      summary:
        'Deepak Nitrite delivered the margin recovery it promised (11% → 18% → 21%) but missed its own project timeline, with MIBK/MIBC slipping from Q4 FY26 to Q2 FY27. Credibility is strong on earnings direction and weaker on execution dates.',
      transcriptsUsed: [
        t('Concall Aug 2026', '830edde9-d00b-4243-98bd-a0e7c77d716b'),
        t('Concall May 2026', '589629dc-be30-42d5-8ed4-bb605071a9bc'),
        t('Concall Feb 2026', '5fe2e422-45bb-44a8-a6e2-c9677c942a8d'),
        t('Concall Nov 2025', '5cea937b-ae35-415f-bec1-eb4943130e05'),
      ],
    },
    thesis: {
      bull: [
        { point: 'Margin recovery is real and repeated', evidence: 'EBITDA margin 10.7% (Q3 FY26) → 17.7% → 20.9% → 20.4% (Q2 FY27)' },
        { point: 'Integration capex is now earning', evidence: '"Successful completion and stabilization of our ammonia-to-amines integration chain" (Aug 2026)' },
        { point: 'Revenue is inflecting', evidence: 'Q2 FY27 revenue ₹3,076 Cr, +61.7% YoY; TTM ₹9,749 Cr vs FY26 ₹7,887 Cr' },
      ],
      bear: [
        { point: 'Project timelines slip', evidence: 'MIBK/MIBC: "targeted for commissioning within this quarter" (Feb 2026) → "scheduled for Q2 FY27" (May 2026)' },
        { point: 'Earnings are commodity-cyclical', evidence: 'FY26 EBITDA margin 12.5% vs 16.2% in FY23: the last down-cycle compressed margins for three years' },
        { point: 'Heavy capex cycle', evidence: 'FY26 capex guidance ~₹1,500 Cr (Nov 2025) vs FY26 PAT of ₹551 Cr' },
      ],
    },
    segments: [
      { name: 'Phenolics', detail: 'Q2 FY26 EBIT margin 11%; H1 FY26 revenue ₹2,637 Cr (Nov 2025 call)' },
      { name: 'Advanced Intermediates', detail: 'Q2 FY26 revenue ₹588 Cr at a 4% EBIT margin (Nov 2025 call)' },
    ],
  },

  HAL: {
    capturedAt: '2026-10-30',
    audit: {
      status: 'seed',
      items: [
        {
          period: 'FY25',
          topic: 'Revenue growth',
          promised: '"Achieving a double-digit growth from FY24-25 onwards upon the commencement of the delivery of LCA aircraft against the 83 LCA programs."',
          promisedSource: 'FY24 call (May 2024)',
          delivered: 'FY25 revenue ₹30,981 Cr, +2.0% YoY.',
          verdict: 'missed',
          rationale: 'Growth hinged on LCA Mk1A deliveries; +2% missed the double-digit promise by a wide margin.',
        },
        {
          period: 'FY25',
          topic: 'EBITDA margin',
          promised: '"On the most optimistic note it could be somewhere around 32% to 33%."',
          promisedSource: 'FY24 call (May 2024)',
          delivered: 'FY25 EBITDA margin 31.1% (₹9,621 Cr) vs 32.1% in FY24.',
          verdict: 'divergent',
          rationale: 'Held near 31% but below the optimistic band, and moving the wrong way.',
        },
        {
          period: 'FY26',
          topic: 'Revenue growth',
          promised: '"What guidance we can give you is around 8% to 10%." Double-digit growth expected "from next year onwards".',
          promisedSource: 'FY25 call (May 2025)',
          delivered: 'FY26 revenue ₹33,089 Cr, +6.8% YoY; EBITDA margin 29.6%.',
          verdict: 'missed',
          rationale: 'Below the bottom of the band, with margins down another ~1.5pp.',
        },
        {
          period: 'FY27',
          topic: 'Revenue growth',
          promised: '"We are confident that LCA and HTT-40 will be delivered, and whatever guidance we are giving, 10% to 12%, we\'ll be able to maintain it."',
          promisedSource: 'FY26 call (May 2026)',
          delivered: 'Q1 FY27 revenue ₹5,515 Cr, +14.4% YoY. Q1 is the smallest quarter: Q4 delivered 42% of FY26 revenue.',
          verdict: 'pending',
          rationale: 'A good start, but the year is decided by Q4 deliveries.',
        },
      ],
      guidance: ['FY27 revenue growth 10%–12%, contingent on LCA Mk1A and HTT-40 deliveries (May 2026)'],
      summary:
        'HAL guides ahead of delivery: double-digit growth promised from FY25 became +2%, and the FY26 band of 8–10% became +6.8%. The order book is not the issue; the timing of LCA deliveries is. Treat FY27\'s 10–12% as contingent until Q3–Q4 report.',
      transcriptsUsed: [
        t('Concall May 2026', '344500e7-2fff-4cc6-a792-c4693e0340f6'),
        t('Concall May 2025', '94da53ef-52aa-4fdd-8cc2-9dcf291a112d'),
        t('Concall May 2024', '7425b322-7f3d-4b7c-bc63-a61673475a4f'),
      ],
      note: 'HAL holds one call a year (after Q4), so this audit runs on fiscal years rather than quarters.',
    },
    thesis: {
      bull: [
        { point: 'Strong start to FY27', evidence: 'Q1 FY27 revenue ₹5,515 Cr (+14.4% YoY); PAT ₹1,590 Cr vs ₹1,384 Cr' },
        { point: 'Cash pile lifts profits', evidence: 'FY26 PBT ₹12,152 Cr exceeds EBITDA ₹9,788 Cr: other income is a large contributor' },
        { point: 'Margins still near 30%', evidence: 'FY26 EBITDA margin 29.6%, high for a manufacturer' },
      ],
      bear: [
        { point: 'Serial guidance misses', evidence: 'FY25: double-digit promised, +2.0% delivered; FY26: 8–10% promised, +6.8% delivered' },
        { point: 'Margin drifting down', evidence: 'EBITDA margin 32.1% (FY24) → 31.1% → 29.6% (FY26)' },
        { point: 'Back-ended, lumpy revenue', evidence: 'Q4 delivered 42% of FY26 revenue (₹13,942 Cr of ₹33,089 Cr)' },
      ],
    },
    segments: [],
  },
};
