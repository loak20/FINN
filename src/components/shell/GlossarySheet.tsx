'use client';

import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GLOSSARY, type GlossaryTerm } from '@/config/portfolio';
import { Sheet } from '../ui/Sheet';
import { cx } from '../ui/primitives';

const GROUPS: GlossaryTerm['group'][] = ['Headline numbers', 'Balance sheet & cash', 'Corporate actions & market', 'Documents'];

export function GlossarySheet({ open, onClose, focus }: { open: boolean; onClose: () => void; focus?: string }) {
  const [q, setQ] = useState('');
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!open) return;
    setQ('');
    if (focus) {
      const t = setTimeout(() => refs.current[focus]?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 280);
      return () => clearTimeout(t);
    }
  }, [open, focus]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return GLOSSARY;
    return GLOSSARY.filter((g) => [g.term, g.definition, ...(g.keys ?? [])].some((x) => x.toLowerCase().includes(s)));
  }, [q]);

  return (
    <Sheet open={open} onClose={onClose} title="Financial Glossary" subtitle="Plain-English definitions from the reference document, and how FINN uses each one.">
      <label className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5">
        <Search className="h-4 w-4 text-zinc-500" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search EBITDA, ROCE, pledging…"
          className="w-full bg-transparent text-[14px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          aria-label="Search glossary"
        />
      </label>

      {filtered.length === 0 && <p className="text-[13px] text-zinc-500">No term matches “{q}”.</p>}

      {GROUPS.map((group) => {
        const terms = filtered.filter((t) => t.group === group);
        if (!terms.length) return null;
        return (
          <section key={group} className="mb-5">
            <div className="label mb-2">{group}</div>
            <div className="space-y-2">
              {terms.map((t) => (
                <div
                  key={t.term}
                  ref={(el) => {
                    refs.current[t.term] = el;
                  }}
                  className={cx('rounded-xl border px-3 py-2.5', focus === t.term && !q ? 'border-signal/60 bg-signal/5' : 'border-zinc-800/80 bg-zinc-900/40')}
                >
                  <div className="text-[13px] font-semibold text-zinc-100">{t.term}</div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">{t.definition}</p>
                  {t.inFinn && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                      <span className="font-semibold text-signal">In FINN · </span>
                      {t.inFinn}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </Sheet>
  );
}
