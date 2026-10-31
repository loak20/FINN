'use client';

import { BarChart3, CircleHelp, ExternalLink, FileText, Mic, Presentation, Quote, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { fmtCr, fmtDate, fmtNum, fmtPct, fmtPrice, pctChange } from '@/lib/format';
import type { AuditItem, AuditVerdict, CashBadge, PullResearchReport, SourceLink } from '@/types/finn';
import { ColumnChart, SERIES } from '../ui/charts';
import { SectionHeader, SourceChip, cx } from '../ui/primitives';
import { DEEP_STEPS, ScrapeLoader } from './ScrapeLoader';

const SOURCE_ICON: Record<SourceLink['kind'], typeof FileText> = {
  screener: BarChart3,
  annual_report: FileText,
  transcript: Mic,
  presentation: Presentation,
  filing: FileText,
};

// ---------------------------------------------------------------------------

export function ReportHeader({ r }: { r: PullResearchReport }) {
  const narrative =
    r.provenance.narrative === 'live' || r.provenance.narrative === 'cache'
      ? `Narrative: ${r.provenance.narrativeModel ?? 'Pro'}`
      : r.provenance.narrative === 'seed'
        ? 'Narrative: pre-computed'
        : null;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="num rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-bold text-zinc-950">{r.ticker}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{r.basis}</span>
          </div>
          <h2 className="mt-1.5 text-[19px] font-bold leading-tight tracking-tight text-zinc-50">{r.name}</h2>
        </div>
        {r.price !== undefined && (
          <div className="text-right">
            <div className="num text-[16px] font-semibold text-zinc-50">{fmtPrice(r.price)}</div>
            <div className="num text-[10px] text-zinc-500">
              {r.marketCapCr !== undefined && <>MCap {fmtCr(r.marketCapCr)}</>}
              {r.pe !== undefined && <> · P/E {r.pe.toFixed(1)}</>}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <SourceChip source={r.provenance.financials} label={`Financials · ${r.provenance.financials === 'seed' ? `snapshot ${fmtDate(r.asOf)}` : r.provenance.financials}`} />
        {narrative && <SourceChip source={r.provenance.narrative === 'seed' ? 'seed' : 'live'} label={narrative} />}
      </div>

      <div className="label mb-1.5 mt-3.5">Primary sources</div>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {r.sources.map((s) => {
          const Icon = SOURCE_ICON[s.kind];
          return (
            <a
              key={s.url + s.label}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="chip shrink-0 border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
            >
              <Icon className="h-3 w-3 text-zinc-500" aria-hidden />
              {s.label}
              <ExternalLink className="h-2.5 w-2.5 text-zinc-600" aria-hidden />
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module 1: business & financial snapshot
// ---------------------------------------------------------------------------

const TONE: Record<string, string> = {
  pos: 'text-emerald-400',
  neg: 'text-rose-400',
  warn: 'text-amber-300',
  neutral: 'text-zinc-500',
};

export function SnapshotModule({ r, onGlossary }: { r: PullResearchReport; onGlossary: (term: string) => void }) {
  const [more, setMore] = useState(false);
  const overview = r.business.overview || 'Screener carries no business description for this company.';

  return (
    <section className="card p-4" aria-labelledby="m1">
      <SectionHeader eyebrow="Module 1" title="Business & Financial Snapshot" />
      <p id="m1" className={cx('text-[13px] leading-relaxed text-zinc-300', !more && 'line-clamp-4')}>
        {overview}
      </p>
      {r.business.keyPoints.length > 0 && more && <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{r.business.keyPoints[0]}</p>}
      {(overview.length > 220 || r.business.keyPoints.length > 0) && (
        <button type="button" onClick={() => setMore((v) => !v)} className="mt-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200">
          {more ? 'Less' : 'More'}
        </button>
      )}

      {r.business.segments.length > 0 && (
        <div className="mt-3">
          <div className="label mb-1.5">Segments (management, from transcripts)</div>
          <ul className="space-y-1.5">
            {r.business.segments.map((s) => (
              <li key={s.name} className="rounded-lg bg-zinc-950/60 px-2.5 py-1.5">
                <div className="text-[12px] font-semibold text-zinc-200">{s.name}</div>
                <div className="text-[11px] text-zinc-400">{s.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {r.snapshot.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => m.term && onGlossary(m.term)}
            className="tap rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-left hover:border-zinc-700"
            aria-label={`${m.label} ${m.value}. Open glossary`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{m.label}</span>
              <CircleHelp className="h-3 w-3 text-zinc-700" aria-hidden />
            </div>
            <div className="mt-0.5 text-[17px] font-semibold tracking-tight text-zinc-50">{m.value}</div>
            {m.sub && <div className={cx('num text-[10px]', TONE[m.tone ?? 'neutral'])}>{m.sub}</div>}
          </button>
        ))}
      </div>

      {r.trajectory.length > 1 && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <ColumnChart
            title="Revenue trajectory (₹ Cr)"
            data={r.trajectory.map((t) => ({ label: t.period, values: [t.revenue] }))}
            series={[{ name: 'Revenue', color: SERIES.s1 }]}
            format={(v) => (v === null ? '—' : fmtCr(v))}
            footRow={{ name: r.isFinancial ? 'Net margin' : 'EBITDA margin', values: r.trajectory.map((t) => (t.opm === null ? null : `${t.opm.toFixed(1)}%`)) }}
          />
          <p className="mt-2.5 text-[12px] leading-relaxed text-zinc-300">{r.trajectoryNote}</p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Module 2: balance sheet & cash quality
// ---------------------------------------------------------------------------

const CASH_BADGE: Record<CashBadge, { cls: string; icon: string }> = {
  'High Conversion': { cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', icon: '✓' },
  'Watch Working Capital': { cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300', icon: '!' },
  'Red Flag': { cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300', icon: '✕' },
  'Not Meaningful': { cls: 'border-zinc-700 bg-zinc-800/60 text-zinc-300', icon: '–' },
};

export function CashModule({ r, onGlossary }: { r: PullResearchReport; onGlossary: (term: string) => void }) {
  const c = r.cash;
  const badge = CASH_BADGE[c.badge];
  return (
    <section className="card p-4" aria-labelledby="m2">
      <SectionHeader
        eyebrow="Module 2"
        title="Balance Sheet & Cash Quality"
        right={
          <button type="button" onClick={() => onGlossary('Cash conversion')} className="text-zinc-600 hover:text-zinc-300" aria-label="What is cash conversion?">
            <CircleHelp className="h-4 w-4" />
          </button>
        }
      />
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500" id="m2">
            Cash conversion · Σ CFO ÷ Σ PAT
          </div>
          <div className="text-[34px] font-bold leading-none tracking-tight text-zinc-50">{c.conversion !== null ? `${c.conversion.toFixed(2)}×` : 'n/m'}</div>
        </div>
        <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', badge.cls)}>
          <span aria-hidden>{badge.icon}</span>
          {c.badge}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{c.explanation}</p>

      {c.years.length > 0 && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <ColumnChart
            title="Operating cash vs reported profit (₹ Cr)"
            data={c.years.map((y, i) => ({ label: y, values: [c.cfo[i], c.pat[i]] }))}
            series={[
              { name: 'Cash from operations', color: SERIES.s1 },
              { name: 'PAT', color: SERIES.s2 },
            ]}
            format={(v) => (v === null ? '—' : fmtCr(v))}
            footRow={{ name: 'Free cash flow', values: c.fcf.map((v) => (v === null ? null : fmtNum(v))) }}
          />
          {c.fcfCumulative !== null && (
            <p className="num mt-2 text-[11px] text-zinc-500">
              Cumulative FCF {c.years[0]}–{c.years[c.years.length - 1]}: <span className="text-zinc-200">{fmtCr(c.fcfCumulative)}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Module 3 (hero): narrative vs. numbers
// ---------------------------------------------------------------------------

const VERDICT: Record<AuditVerdict, { label: string; cls: string }> = {
  delivered: { label: '✅ Delivered', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  divergent: { label: '⚠️ Divergent', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  missed: { label: '🚨 Missed', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  pending: { label: '⏳ Pending', cls: 'border-zinc-700 bg-zinc-800/60 text-zinc-300' },
};

function AuditCard({ item }: { item: AuditItem }) {
  const v = VERDICT[item.verdict];
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="num text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{item.period}</div>
          <div className="text-[13px] font-semibold text-zinc-100">{item.topic}</div>
        </div>
        <span className={cx('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', v.cls)}>{v.label}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-zinc-900 p-2.5">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            <Quote className="h-3 w-3" aria-hidden /> What management promised
          </div>
          <p className="text-[12px] leading-snug text-zinc-200">{item.promised}</p>
          <p className="mt-1.5 text-[10px] text-zinc-500">{item.promisedSource}</p>
        </div>
        <div className="rounded-lg bg-zinc-900 p-2.5">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            <BarChart3 className="h-3 w-3" aria-hidden /> What the numbers delivered
          </div>
          <p className="text-[12px] leading-snug text-zinc-200">{item.delivered}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-zinc-400">{item.rationale}</p>
    </article>
  );
}

function NumbersOnly({ r }: { r: PullResearchReport }) {
  const q = r.quarters;
  const rows = q.periods.map((p, i) => ({ p, rev: q.revenue[i], yoy: pctChange(q.revenue[i], q.revenue[i - 4] ?? null), opm: q.opm[i], pat: q.pat[i] })).slice(-4);
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800">
      <div className="bg-zinc-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">What the numbers delivered · last 4 quarters</div>
      <table className="w-full text-[12px]">
        <thead className="text-zinc-500">
          <tr className="border-t border-zinc-800">
            <th className="px-3 py-1.5 text-left font-medium">Quarter</th>
            <th className="px-2 py-1.5 text-right font-medium">Revenue</th>
            <th className="px-2 py-1.5 text-right font-medium">YoY</th>
            <th className="px-2 py-1.5 text-right font-medium">{r.isFinancial ? 'Net mgn' : 'EBITDA mgn'}</th>
            <th className="px-3 py-1.5 text-right font-medium">PAT</th>
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((x) => (
            <tr key={x.p} className="border-t border-zinc-800/80">
              <td className="px-3 py-1.5 text-zinc-400">{x.p}</td>
              <td className="px-2 py-1.5 text-right text-zinc-200">{fmtNum(x.rev)}</td>
              <td className={cx('px-2 py-1.5 text-right', (x.yoy ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{fmtPct(x.yoy, { digits: 1 })}</td>
              <td className="px-2 py-1.5 text-right text-zinc-200">{x.opm === null ? '—' : `${x.opm.toFixed(1)}%`}</td>
              <td className="px-3 py-1.5 text-right text-zinc-200">{fmtNum(x.pat)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditModule({ r, deepLoading, onRetry }: { r: PullResearchReport; deepLoading: boolean; onRetry: () => void }) {
  const a = r.audit;
  const tally = (['delivered', 'divergent', 'missed', 'pending'] as AuditVerdict[]).map((v) => ({ v, n: a.items.filter((i) => i.verdict === v).length })).filter((t) => t.n > 0);
  const how =
    a.status === 'complete'
      ? `Flash read ${a.transcriptsUsed.length} transcript${a.transcriptsUsed.length === 1 ? '' : 's'}; ${r.provenance.narrativeModel ?? 'Pro'} judged each promise against the reported numbers.`
      : a.status === 'seed'
        ? 'Pre-computed: every promise is quoted from the linked BSE transcripts; every outcome from the reported numbers.'
        : null;

  return (
    <section className="rounded-2xl border border-signal/30 bg-gradient-to-b from-signal/[0.06] to-zinc-900/60 p-4" aria-labelledby="m3">
      <SectionHeader eyebrow="Module 3 · Hero" title="Narrative vs. Numbers" hero />
      <p id="m3" className="-mt-1 text-[12px] text-zinc-400">
        What management promised on its own calls, against what the reported numbers actually delivered.
      </p>

      {deepLoading ? (
        <div className="mt-3">
          <ScrapeLoader steps={DEEP_STEPS} stepMs={4500} title="Auditing management" />
        </div>
      ) : (
        <>
          {tally.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tally.map((t) => (
                <span key={t.v} className={cx('num rounded-full border px-2 py-0.5 text-[11px] font-semibold', VERDICT[t.v].cls)}>
                  {t.n} {VERDICT[t.v].label}
                </span>
              ))}
            </div>
          )}
          {a.summary && <p className="mt-3 text-[13px] leading-relaxed text-zinc-200">{a.summary}</p>}

          {a.items.length > 0 && (
            <div className="mt-3 space-y-2.5">
              {a.items.map((i, k) => (
                <AuditCard key={`${i.period}-${k}`} item={i} />
              ))}
            </div>
          )}

          {a.guidance.length > 0 && (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="label mb-1.5">Guidance on the record now</div>
              <ul className="space-y-1">
                {a.guidance.map((g) => (
                  <li key={g} className="flex gap-1.5 text-[12px] text-zinc-300">
                    <span className="text-signal">›</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.note && <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">{a.note}</p>}
          {(a.status === 'needs-key' || a.status === 'no-transcripts' || (a.status === 'failed' && !a.items.length)) && <NumbersOnly r={r} />}
          {a.status === 'failed' && (
            <button type="button" onClick={onRetry} className="tap mt-3 inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-[12px] font-semibold text-zinc-100">
              <RefreshCw className="h-3.5 w-3.5" /> Retry audit (resumes from cache)
            </button>
          )}

          {(how || a.transcriptsUsed.length > 0) && (
            <div className="mt-3 border-t border-zinc-800/70 pt-2.5">
              {how && <p className="text-[10px] text-zinc-500">{how}</p>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {a.transcriptsUsed.map((t) => (
                  <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="chip border-zinc-800 bg-zinc-950/60 text-[10px] text-zinc-400 hover:text-zinc-200">
                    <Mic className="h-3 w-3" aria-hidden /> {t.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Module 4: bull vs. bear
// ---------------------------------------------------------------------------

const THESIS_SOURCE = {
  rules: 'Rules over the reported statements (Tier 0). Primary data only.',
  llm: 'Pro, grounded in the transcripts and statements above. No news, no broker views.',
  seed: 'Pre-computed from the linked transcripts and reported statements.',
};

export function ThesisModule({ r }: { r: PullResearchReport }) {
  const sides = [
    { key: 'bull', title: 'Bull case', Icon: TrendingUp, points: r.thesis.bull, cls: 'text-emerald-400', bar: 'bg-emerald-500/60' },
    { key: 'bear', title: 'Bear case', Icon: TrendingDown, points: r.thesis.bear, cls: 'text-rose-400', bar: 'bg-rose-500/60' },
  ];
  return (
    <section className="card p-4" aria-labelledby="m4">
      <SectionHeader eyebrow="Module 4" title="Bull vs. Bear" />
      <div id="m4" className="space-y-4">
        {sides.map((s) => (
          <div key={s.key}>
            <div className={cx('mb-2 flex items-center gap-1.5 text-[12px] font-semibold', s.cls)}>
              <s.Icon className="h-4 w-4" aria-hidden />
              {s.title}
            </div>
            {s.points.length === 0 ? (
              <p className="text-[12px] text-zinc-500">Nothing in the primary data argues strongly this way.</p>
            ) : (
              <ol className="space-y-2">
                {s.points.map((p, i) => (
                  <li key={p.point} className="flex gap-2.5">
                    <span className={cx('mt-0.5 w-0.5 shrink-0 self-stretch rounded-full', s.bar)} aria-hidden />
                    <div>
                      <div className="text-[13px] font-semibold leading-snug text-zinc-100">
                        <span className="num mr-1 text-zinc-600">{i + 1}.</span>
                        {p.point}
                      </div>
                      <div className="num mt-0.5 text-[11px] leading-snug text-zinc-400">{p.evidence}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-zinc-600">{THESIS_SOURCE[r.thesis.source]}</p>
    </section>
  );
}

