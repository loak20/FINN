'use client';

import { Inbox, Radar, Telescope, type LucideIcon } from 'lucide-react';
import { cx } from '../ui/primitives';

export type Tab = 'digest' | 'triggers' | 'research';

const TABS: { key: Tab; label: string; sub: string; Icon: LucideIcon }[] = [
  { key: 'digest', label: 'Digest', sub: 'Push A', Icon: Inbox },
  { key: 'triggers', label: 'Triggers', sub: 'Push B', Icon: Radar },
  { key: 'research', label: 'Research', sub: 'Pull', Icon: Telescope },
];

export function BottomNav({ tab, onTab, badges }: { tab: Tab; onTab: (t: Tab) => void; badges: Partial<Record<Tab, number>> }) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-zinc-800 bg-zinc-950/95 pb-safe backdrop-blur-md" aria-label="Primary">
      <div className="grid grid-cols-3">
        {TABS.map(({ key, label, sub, Icon }) => {
          const active = tab === key;
          const badge = badges[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTab(key)}
              aria-current={active ? 'page' : undefined}
              className={cx('tap relative flex flex-col items-center gap-0.5 pb-1.5 pt-2.5', active ? 'text-zinc-50' : 'text-zinc-500 hover:text-zinc-300')}
            >
              {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-signal" aria-hidden />}
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden />
                {badge ? (
                  <span className="num absolute -right-3 -top-1.5 min-w-[18px] rounded-full bg-signal px-1 text-center text-[10px] font-bold leading-[16px] text-zinc-950">
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] font-medium">{label}</span>
              <span className="text-[9px] uppercase tracking-wider text-zinc-600">{sub}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
