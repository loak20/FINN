'use client';

import { useId, useMemo, useState } from 'react';
import { cx } from './primitives';

// Hand-rolled SVG charts (no chart library): one axis per chart, thin marks, 4px rounded
// data-ends, 2px surface gaps, a readout that follows hover/focus/tap, and a table view.
// Dark-mode categorical slots: blue (series 1), orange (series 2).

export const SERIES = { s1: '#3987e5', s2: '#d95926', muted: '#71717a', surface: '#18181b', grid: '#27272a', baseline: '#3f3f46' };
const UP = '#34d399';
const DOWN = '#fb7185';

/** Bar path with a rounded data-end (radius r) and a square baseline. Works for negative bars. */
function barPath(x: number, w: number, yBase: number, yEnd: number, r: number): string {
  const h = Math.abs(yBase - yEnd);
  const rr = Math.min(r, w / 2, h);
  if (h < 0.5) return '';
  const dir = yEnd < yBase ? 1 : -1; // 1 = grows upward
  const yr = yEnd + dir * rr;
  return [
    `M${x},${yBase}`,
    `V${yr}`,
    `Q${x},${yEnd} ${x + rr},${yEnd}`,
    `H${x + w - rr}`,
    `Q${x + w},${yEnd} ${x + w},${yr}`,
    `V${yBase}`,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Sparkline (stat-tile trend: de-emphasised line, current point in the delta colour)
// ---------------------------------------------------------------------------

export function Sparkline({ values, width = 96, height = 30, label }: { values: number[]; width?: number; height?: number; label: string }) {
  const id = useId();
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const pad = 4;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (width - pad * 2);
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2));
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const tone = last >= prev ? UP : DOWN;
  const change = ((last - pts[0]) / pts[0]) * 100;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${pts.length} sessions, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% over the period`}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#a1a1aa" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#a1a1aa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g${id})`} />
      <path d={line} fill="none" stroke="#a1a1aa" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(last)} r={4} fill={tone} stroke={SERIES.surface} strokeWidth={2} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Meter (volume multiple vs. the user's threshold)
// ---------------------------------------------------------------------------

export function Meter({ value, threshold, max = 5, label }: { value: number; threshold: number; max?: number; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const tick = Math.min(100, (threshold / max) * 100);
  const breached = value >= threshold;
  return (
    <div className="relative h-2 w-full rounded-full bg-zinc-800" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className={cx('h-2 rounded-full', breached ? 'bg-signal' : 'bg-zinc-500')} style={{ width: `${pct}%` }} />
      <div className="absolute -top-1 h-4 w-0.5 rounded bg-zinc-100" style={{ left: `calc(${tick}% - 1px)` }} title={`Threshold ${threshold}×`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared column-chart frame
// ---------------------------------------------------------------------------

interface Datum {
  label: string;
  values: (number | null)[];
}

interface ColumnChartProps {
  title: string;
  data: Datum[];
  series: { name: string; color: string }[];
  format: (v: number | null) => string;
  /** Optional text row under the columns (e.g. margin %), aligned to each period. */
  footRow?: { name: string; values: (string | null)[] };
  height?: number;
}

export function ColumnChart({ title, data, series, format, footRow, height = 132 }: ColumnChartProps) {
  const [active, setActive] = useState(data.length - 1);
  const [table, setTable] = useState(false);
  const W = 360;
  const H = height;
  const padTop = 18;
  const padBottom = 18;

  const { y, yBase } = useMemo(() => {
    const all = data.flatMap((d) => d.values).filter((v): v is number => v !== null);
    const max = Math.max(0, ...all);
    const min = Math.min(0, ...all);
    const span = max - min || 1;
    const yy = (v: number) => padTop + ((max - v) / span) * (H - padTop - padBottom);
    return { y: yy, yBase: yy(0) };
  }, [data, H]);

  const band = W / data.length;
  const gap = 2;
  const barW = Math.min(24, (band - 14 - gap * (series.length - 1)) / series.length);
  const groupW = barW * series.length + gap * (series.length - 1);
  const act = data[active] ?? data[data.length - 1];

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] text-zinc-400">
          <span className="font-medium text-zinc-300">{title}</span>
        </div>
        <button type="button" onClick={() => setTable((t) => !t)} className="text-[11px] font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
          {table ? 'Chart' : 'Table'}
        </button>
      </div>

      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-zinc-400">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
              {s.name}
            </span>
          ))}
        </div>
      )}

      {table ? (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-[12px]">
            <thead className="bg-zinc-900 text-zinc-500">
              <tr>
                <th className="px-2.5 py-1.5 text-left font-medium">Period</th>
                {series.map((s) => (
                  <th key={s.name} className="px-2.5 py-1.5 text-right font-medium">
                    {s.name}
                  </th>
                ))}
                {footRow && <th className="px-2.5 py-1.5 text-right font-medium">{footRow.name}</th>}
              </tr>
            </thead>
            <tbody className="num">
              {data.map((d, i) => (
                <tr key={d.label} className="border-t border-zinc-800/80">
                  <td className="px-2.5 py-1.5 text-zinc-400">{d.label}</td>
                  {d.values.map((v, k) => (
                    <td key={k} className="px-2.5 py-1.5 text-right text-zinc-200">
                      {format(v)}
                    </td>
                  ))}
                  {footRow && <td className="px-2.5 py-1.5 text-right text-zinc-400">{footRow.values[i] ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="mb-1 flex min-h-[18px] flex-wrap items-baseline gap-x-3 text-[11px] text-zinc-500" aria-live="polite">
            <span className="font-medium text-zinc-400">{act?.label}</span>
            {series.map((s, k) => (
              <span key={s.name} className="inline-flex items-baseline gap-1">
                <span className="num text-[12px] font-semibold text-zinc-100">{format(act?.values[k] ?? null)}</span>
                <span>{s.name}</span>
              </span>
            ))}
            {footRow && act && (
              <span className="inline-flex items-baseline gap-1">
                <span className="num text-[12px] font-semibold text-zinc-100">{footRow.values[active] ?? '—'}</span>
                <span>{footRow.name}</span>
              </span>
            )}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title} by period`} onPointerLeave={() => setActive(data.length - 1)}>
            {[0.5].map((f) => (
              <line key={f} x1={0} x2={W} y1={padTop + f * (H - padTop - padBottom)} y2={padTop + f * (H - padTop - padBottom)} stroke={SERIES.grid} strokeWidth={1} />
            ))}
            {data.map((d, i) => {
              const gx = i * band + (band - groupW) / 2;
              const isActive = i === active;
              return (
                <g
                  key={d.label}
                  tabIndex={0}
                  role="button"
                  aria-label={`${d.label}: ${series.map((s, k) => `${s.name} ${format(d.values[k])}`).join(', ')}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className="cursor-pointer outline-none"
                >
                  <rect x={i * band} y={0} width={band} height={H} fill="transparent" />
                  {d.values.map((v, k) =>
                    v === null ? null : (
                      <path
                        key={k}
                        d={barPath(gx + k * (barW + gap), barW, yBase, y(v), 4)}
                        fill={series[k].color}
                        opacity={isActive ? 1 : 0.55}
                      />
                    ),
                  )}
                  <text x={i * band + band / 2} y={H - 4} textAnchor="middle" fontSize={10} fill={isActive ? '#e4e4e7' : '#71717a'}>
                    {d.label}
                  </text>
                </g>
              );
            })}
            <line x1={0} x2={W} y1={yBase} y2={yBase} stroke={SERIES.baseline} strokeWidth={1} />
          </svg>
          {footRow && (
            <div className="mt-1 grid text-center" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
              {footRow.values.map((v, i) => (
                <span key={i} className={cx('num text-[10px]', i === active ? 'text-zinc-200' : 'text-zinc-500')}>
                  {v ?? '—'}
                </span>
              ))}
            </div>
          )}
          {footRow && <div className="mt-0.5 text-center text-[10px] text-zinc-600">{footRow.name}</div>}
        </>
      )}
    </div>
  );
}
