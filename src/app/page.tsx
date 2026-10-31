'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MATERIAL_SCORE } from '@/config/portfolio';
import { getJson, loadPref, savePref, withSource } from '@/lib/client';
import type { AnnouncementsResponse, CorporateFiling, DigestFilter, MarketDataResponse, SourceMode, TimeWindow } from '@/types/finn';
import { DigestView, inWindow } from '@/components/push/DigestView';
import { DEFAULT_THRESHOLDS, TriggersView, breaches, type Thresholds } from '@/components/push/TriggersView';
import { ResearchView } from '@/components/pull/ResearchView';
import { BottomNav, type Tab } from '@/components/shell/BottomNav';
import { GlossarySheet } from '@/components/shell/GlossarySheet';
import { Header } from '@/components/shell/Header';
import { PortfolioStrip } from '@/components/shell/PortfolioStrip';
import { TelemetryProvider, useTelemetry } from '@/components/shell/TelemetryContext';
import { TelemetrySheet } from '@/components/shell/TelemetrySheet';

function FinnApp() {
  const { record, setLlm, llm } = useTelemetry();
  const [tab, setTab] = useState<Tab>('digest');
  const [sheet, setSheet] = useState<null | 'router' | 'glossary'>(null);
  const [glossaryFocus, setGlossaryFocus] = useState<string | undefined>();
  const [sourceMode, setSourceMode] = useState<SourceMode>('auto');
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
  const [filter, setFilter] = useState<DigestFilter>('all');
  const [market, setMarket] = useState<MarketDataResponse | null>(null);
  const [ann, setAnn] = useState<AnnouncementsResponse | null>(null);
  const [annLoading, setAnnLoading] = useState(false);
  const [target, setTarget] = useState<{ ticker: string; nonce: number } | null>(null);

  // Per-viewer conveniences only; the app renders correctly without them.
  useEffect(() => {
    setSourceMode(loadPref<SourceMode>('source', 'auto'));
    setThresholds(loadPref<Thresholds>('thresholds', DEFAULT_THRESHOLDS));
    setTimeWindow(loadPref<TimeWindow>('window', '24h'));

    // Deep links: ?tab=triggers, ?tab=research&t=POLYCAB (handy for sharing a specific view).
    const params = new URLSearchParams(globalThis.location?.search ?? '');
    const t = params.get('t');
    const tabParam = params.get('tab');
    if (t) {
      setTarget({ ticker: t, nonce: Date.now() });
      setTab('research');
    } else if (tabParam === 'triggers' || tabParam === 'research' || tabParam === 'digest') {
      setTab(tabParam);
    }
  }, []);

  const loadMarket = useCallback(async () => {
    try {
      const m = await getJson<MarketDataResponse>(withSource('/api/market-data', sourceMode));
      setMarket(m);
      setLlm(m.llm);
      record(m.telemetry);
    } catch {
      setMarket((prev) => prev ?? { items: [], asOf: new Date().toISOString(), coverage: { live: 0, cache: 0, seed: 0 }, llm: { enabled: false, flash: '', pro: '' }, telemetry: [] });
    }
  }, [record, setLlm, sourceMode]);

  const loadAnn = useCallback(async () => {
    setAnnLoading(true);
    try {
      const a = await getJson<AnnouncementsResponse>(withSource('/api/announcements', sourceMode));
      setAnn(a);
      record(a.telemetry);
    } catch {
      setAnn((prev) => prev ?? { filings: [], asOf: new Date().toISOString(), mode: 'seed', coverage: { live: [], seed: [] }, telemetry: [] });
    } finally {
      setAnnLoading(false);
    }
  }, [record, sourceMode]);

  useEffect(() => {
    setMarket(null);
    setAnn(null);
    loadMarket();
    loadAnn();
  }, [loadMarket, loadAnn]);

  const updateFiling = useCallback((id: string, patch: Partial<CorporateFiling>) => {
    setAnn((a) => (a ? { ...a, filings: a.filings.map((f) => (f.id === id ? { ...f, ...patch } : f)) } : a));
  }, []);

  const deepDive = useCallback((ticker: string) => {
    setTarget({ ticker, nonce: Date.now() });
    setTab('research');
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, []);

  const openGlossary = useCallback((term?: string) => {
    setGlossaryFocus(term);
    setSheet('glossary');
  }, []);

  const alerts = useMemo(() => (market ? market.items.filter((i) => breaches(i, thresholds).triggered).length : 0), [market, thresholds]);
  const material24h = useMemo(() => (ann ? inWindow(ann.filings, ann.asOf, '24h').filter((f) => f.score >= MATERIAL_SCORE).length : null), [ann]);

  const changeTab = (t: Tab) => {
    setTab(t);
    globalThis.scrollTo?.({ top: 0 });
  };

  return (
    <div className="relative mx-auto min-h-screen max-w-[430px] border-x border-zinc-800 bg-zinc-950 pb-20 text-zinc-100 shadow-2xl">
      <Header onRouter={() => setSheet('router')} onGlossary={() => openGlossary()} />
      <PortfolioStrip items={market?.items ?? null} alerts={alerts} material24h={material24h} onPick={deepDive} />

      <main className="px-4 pb-10 pt-4">
        {tab === 'digest' && (
          <DigestView
            data={ann}
            loading={annLoading}
            window={timeWindow}
            onWindow={(w) => {
              setTimeWindow(w);
              savePref('window', w);
            }}
            filter={filter}
            onFilter={setFilter}
            llmEnabled={Boolean(llm?.enabled)}
            onUpdate={updateFiling}
            onDeepDive={deepDive}
            onRefresh={loadAnn}
          />
        )}
        {tab === 'triggers' && (
          <TriggersView
            market={market?.items ?? null}
            ann={ann}
            thresholds={thresholds}
            onThresholds={(t) => {
              setThresholds(t);
              savePref('thresholds', t);
            }}
            onDeepDive={deepDive}
          />
        )}
        <div hidden={tab !== 'research'}>
          <ResearchView target={target} sourceMode={sourceMode} onGlossary={openGlossary} />
        </div>
      </main>

      <BottomNav tab={tab} onTab={changeTab} badges={{ digest: material24h ?? undefined, triggers: alerts || undefined }} />

      <TelemetrySheet
        open={sheet === 'router'}
        onClose={() => setSheet(null)}
        sourceMode={sourceMode}
        onSourceMode={(m) => {
          setSourceMode(m);
          savePref('source', m);
        }}
      />
      <GlossarySheet open={sheet === 'glossary'} onClose={() => setSheet(null)} focus={glossaryFocus} />
    </div>
  );
}

export default function Page() {
  return (
    <TelemetryProvider>
      <FinnApp />
    </TelemetryProvider>
  );
}
