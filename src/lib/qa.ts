import type { AskResponse, PullResearchReport, ScreenerData, TelemetryEvent } from '@/types/finn';
import { fmtCr, fmtPct } from './format';
import { callGemini, hasGemini, modelFor } from './llm';
import { compactFinancials } from './research';
import { skippedEvent, tier0Event } from './telemetry';

// Scoped primary-source Q&A. Flash answers strictly from the scraped statements and the
// extracted guidance; without a key a keyword router answers from the same tables.

const QA_SYSTEM = [
  'You answer an investor\'s question about one Indian listed company using ONLY the JSON provided:',
  'statements scraped from Screener.in (company filings) and guidance extracted from earnings-call transcripts.',
  'No outside knowledge, news or opinions about the company. If the data cannot answer, say exactly what is missing.',
  'Be concrete: cite numbers with periods. Max 90 words. Plain text, no markdown.',
  'Return JSON: {"answer":"","citations":["e.g. Quarterly results Q2 FY27","Cash flow FY22-FY26","Q1 FY27 concall guidance"]}',
].join('\n');

function rulesAnswer(r: PullResearchReport, question: string): { answer: string; citations: string[] } {
  const q = question.toLowerCase();
  const m = (key: string) => r.snapshot.find((s) => s.key === key);
  const quarters = r.quarters;
  const lastQ = quarters.periods.length - 1;

  if (/guid|promis|management|narrative|concall|commentary|outlook/.test(q)) {
    if (r.audit.items.length) {
      const counts = (['delivered', 'divergent', 'missed'] as const).map((v) => `${r.audit.items.filter((i) => i.verdict === v).length} ${v}`).join(', ');
      const latest = r.audit.guidance.slice(0, 2).join(' ');
      return { answer: `Across ${r.audit.items.length} audited promises: ${counts}. ${r.audit.summary ?? ''} ${latest ? `On the record now: ${latest}` : ''}`.trim(), citations: r.audit.transcriptsUsed.map((t) => t.label) };
    }
    return { answer: r.audit.note ?? 'No management guidance has been extracted for this company yet.', citations: [] };
  }
  if (/margin|ebitda|opm|profitab/.test(q)) {
    const series = quarters.periods.map((p, i) => `${p} ${quarters.opm[i] ?? '—'}%`).slice(-4).join(', ');
    const annual = r.trajectory.map((t) => `${t.period} ${t.opm !== null ? t.opm.toFixed(1) : '—'}%`).join(' → ');
    return { answer: `${m('margin')?.label} is ${m('margin')?.value} TTM (${m('margin')?.sub ?? 'n/a'}). Annual: ${annual}. Last four quarters: ${series}.`, citations: ['P&L (annual)', 'Quarterly results'] };
  }
  if (/debt|borrow|leverage|d\/e|gearing|balance sheet/.test(q)) {
    return { answer: `Debt/Equity ${m('de')?.value} (${m('de')?.sub ?? ''}). ROE ${m('roe')?.value}, ROCE ${m('roce')?.value}.`, citations: ['Balance sheet (latest)', 'Ratios'] };
  }
  if (/cash|cfo|fcf|conversion|convert/.test(q)) {
    const c = r.cash;
    const rows = c.years.map((y, i) => `${y}: CFO ${fmtCr(c.cfo[i])} vs PAT ${fmtCr(c.pat[i])}`).join('; ');
    return { answer: `${c.badge}${c.conversion !== null ? ` (${c.conversion.toFixed(2)}×)` : ''}. ${c.explanation} ${rows}.`, citations: [`Cash flow ${c.years[0]}–${c.years[c.years.length - 1]}`, 'P&L'] };
  }
  if (/working capital|inventor|receivable|debtor|payable/.test(q)) {
    return { answer: `Working capital: ${m('wc')?.value} (${m('wc')?.sub ?? 'no history'}). ${r.cash.badge === 'Watch Working Capital' ? 'Cash conversion confirms working capital is absorbing cash.' : ''}`.trim(), citations: ['Ratios (working-capital days)'] };
  }
  if (/roe|roce|return/.test(q)) {
    return { answer: `ROE ${m('roe')?.value}, ROCE ${m('roce')?.value}.`, citations: ['Ratios', 'Screener top ratios'] };
  }
  if (/valuation|p\/?e\b|multiple|expensive|cheap|market cap/.test(q)) {
    return { answer: `P/E ${r.pe ?? '—'}× on market cap ${fmtCr(r.marketCapCr ?? null)}; 5Y CAGR sales/PAT ${m('trajectory')?.value}.`, citations: ['Screener top ratios', 'P&L growth'] };
  }
  if (/revenue|sales|growth|top ?line|quarter|result/.test(q)) {
    const rev = quarters.revenue[lastQ];
    const ya = quarters.revenue[lastQ - 4];
    const yoy = rev !== null && ya ? ((rev - ya) / ya) * 100 : null;
    return { answer: `${quarters.periods[lastQ]} revenue ${fmtCr(rev)} (${fmtPct(yoy)} YoY). TTM ${m('revenue')?.value}; ${r.trajectoryNote}`, citations: ['Quarterly results', 'P&L (annual)'] };
  }
  return {
    answer: `${r.name}: revenue ${m('revenue')?.value} TTM, ${m('margin')?.label.toLowerCase()} ${m('margin')?.value}, ROE ${m('roe')?.value}, cash conversion ${r.cash.badge}. Ask about margins, growth, debt, cash, working capital, returns or guidance.`,
    citations: ['Screener statements'],
  };
}

export async function answerQuestion(
  d: ScreenerData,
  report: PullResearchReport,
  question: string,
  route: string,
): Promise<AskResponse> {
  const started = Date.now();
  const events: TelemetryEvent[] = [];

  if (hasGemini()) {
    try {
      const context = {
        financials: compactFinancials(d),
        business: report.business.overview.slice(0, 600),
        guidanceOnRecord: report.audit.guidance,
        auditItems: report.audit.items.map((i) => ({ period: i.period, promised: i.promised, delivered: i.delivered, verdict: i.verdict })),
        cashQuality: { conversion: report.cash.conversion, badge: report.cash.badge, years: report.cash.years, cfo: report.cash.cfo, pat: report.cash.pat },
      };
      const r = await callGemini<{ answer: string; citations?: string[] }>({
        tier: 1,
        route,
        task: `${d.ticker}: scoped Q&A`,
        system: QA_SYSTEM,
        parts: [{ text: `DATA:\n${JSON.stringify(context)}\n\nQUESTION: ${question.slice(0, 300)}` }],
        timeoutMs: 15_000,
      });
      events.push(r.event);
      return { answer: String(r.data.answer ?? '').slice(0, 900), citations: (r.data.citations ?? []).map(String).slice(0, 5), tier: 1, telemetry: events };
    } catch (e) {
      events.push(skippedEvent(route, `${d.ticker}: scoped Q&A`, 1, modelFor(1), `Flash failed (${(e as Error).message.slice(0, 60)}); answered from tables`));
    }
  }

  const a = rulesAnswer(report, question);
  events.push(tier0Event(route, `${d.ticker}: scoped Q&A (keyword router over tables)`, started));
  return { ...a, tier: 0, telemetry: events };
}
