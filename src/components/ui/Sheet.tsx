'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

// Bottom sheet constrained to the 430px app column. Closes on backdrop tap and Escape.

export function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 h-full w-full animate-fade-in bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[86vh] w-full max-w-[430px] animate-sheet-up flex-col rounded-t-3xl border-t border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-zinc-700" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="tap rounded-full bg-zinc-900 p-2 text-zinc-400 hover:text-zinc-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 pb-safe">{children}</div>
      </div>
    </div>
  );
}
