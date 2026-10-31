# FINN: Financial Investment Agent

A mobile-first intelligence layer for a 16-stock Indian equity portfolio, built for the ENAM AI Engineer Build Challenge.

- **Push A: Digest.** Every BSE filing across the book for the last 24h / 3d / 7d, classified into the 17 reference categories, scored 0–100 for materiality, same-event filings folded together, routine paperwork buried. Results arrive as a Revenue / EBITDA / PBT / PAT matrix with QoQ and YoY; management changes arrive with an executive bio.
- **Push B: Triggers.** You set what "unusual" means (±price %, volume × 20-day average); the portfolio splits live into alerts and quiet names. Each alert is cross-checked against filings from the last 48h.
- **Pull: Research.** Any NSE ticker, scraped live from Screener.in: snapshot, trajectory, cash conversion, and the hero **Narrative vs. Numbers** audit, which holds management to its own concall guidance. Bull vs. bear and Q&A use primary sources only.
- **Smart router telemetry + glossary.** Every step is logged with its tier, model, tokens and cost; every term from the reference PDF is one tap away.

It runs fully **without an API key** (Tier 0 + real offline snapshots). A Gemini key unlocks live transcript audits, PDF extraction and model Q&A.

---

## Architecture

```
            Yahoo v8 chart ──► /api/market-data ──► %chg, 20D vol multiple (Tier 0)
                                                     │
Screener.in company page ─┬─► /api/announcements ──► rules classifier (Tier 0) ─► Flash for ambiguous only (Tier 1)
 (cheerio, cached 30 min) │                          results matrix from structured tables (Tier 0, $0)
                          │                          noise-cancel clustering
                          └─► /api/research/[t] ──► ratios, cash conversion, rules thesis (Tier 0)
                                     │ stage=deep
BSE concall transcript PDFs ─────────┴──► Flash: guidance per transcript (cached 30 days)
                                          └► Pro: promised vs delivered over ~4k tokens (Tier 2)
Every route: live → fresh cache → stale cache → seed snapshot.  Never a 500, never an empty screen.
```

### Smart model routing

| Tier | Model | Used for | Why |
|---|---|---|---|
| 0 | none, $0 | EOD math, slider filtering, cheerio extraction, 17-category rules classifier, results QoQ/YoY from structured tables, cash conversion / D/E / CAGR, rules bull/bear and Q&A, caching | If a formula or regex can answer it, a model never sees it |
| 1 | `gemini-2.5-flash` (thinking off, JSON) | Ambiguous filings only (batched 25/call); results numbers from a filing PDF when tables lag; executive bio from the Reg-30 annexure; guidance extraction per transcript; scoped Q&A | Bulk, low-ambiguity reading |
| 2 | `gemini-2.5-pro` (thinking capped at 2k) | Narrative vs. Numbers audit + grounded bull/bear | The one place judgement is the product |

Cost controls:

- **Rules first.** About 90% of filings never reach a model.
- **On demand.** PDF enrichment runs only when you tap "Read the filing PDF" or "Pull bio".
- **Chunked audit.** Pro reads compact Flash extracts plus a numbers table, not 100+ transcript pages.
- **Caching.** Every LLM call is cached by prompt hash.
- **Degradation.** If Pro times out it degrades to Flash, then to the pre-computed audit, and the drawer records each step.
- **Retired models.** If a pinned model is retired, calls fall back to `gemini-flash-latest` / `gemini-pro-latest`.

### Data sources and honest notes

- **EOD:** Yahoo Finance v8 chart API (`.NS`, `range=1mo&interval=1d`). Tata Motors' PV business now trades as **TMPV** (Oct 2025 demerger) and Zomato as **ETERNAL**. Display tickers follow the brief; live symbols resolve through `src/config/portfolio.ts`.
- **Filings:** BSE corporate announcements as embedded on each Screener.in company page (real titles, timestamps, PDF links). NSE's API sits behind a bot wall for non-browser clients; FINN does not try to get around it.
- **Fundamentals and concalls:** Screener.in consolidated tables (standalone fallback), plus concall transcripts and annual reports linked from it.
- **Offline seeds** (`src/data/snapshots/`) are **real captures**, not invented data, made through the app's own scrapers on 30 Oct 2026 (`npm run snapshot`):
  - Yahoo EOD for 16 stocks, 44 classified BSE filings, and Screener statements for all 20 tickers.
  - Seed filings are re-timed to "now" so the windows stay demoable; the card shows the real filing time.
  - The five pre-computed audits (INFY, POLYCAB, INDHOTEL, DEEPAKNTR, HAL) quote management verbatim from the linked BSE transcripts and cite reported numbers.
  - Executive bios come from the filings' Reg-30 annexures. HDFC Bank's filing defers to an earlier intimation, so that background is compiled from public profile and labelled as such.

---

## Directory tree

```
finn/
├── .env.example                 # GEMINI_API_KEY (optional) + model overrides
├── .gitignore                   # node_modules/ .venv/ .next/ .env.local …
├── next.config.mjs
├── package.json                 # all deps local; no global installs
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json                  # pins functions to bom1 (Mumbai), next to BSE/Screener
├── scripts/
│   └── snapshot.mjs             # refresh offline seeds from a running dev server
└── src/
    ├── app/
    │   ├── layout.tsx  globals.css  page.tsx  manifest.ts  icon.svg
    │   └── api/
    │       ├── market-data/route.ts         # Yahoo EOD → %chg, 20D volume multiple
    │       ├── announcements/route.ts       # GET digest · POST on-demand PDF enrichment
    │       └── research/[ticker]/route.ts   # GET core|deep report · POST scoped Q&A
    ├── components/
    │   ├── shell/   Header · PortfolioStrip · BottomNav · TelemetrySheet · GlossarySheet · TelemetryContext
    │   ├── push/    DigestView · FilingCards (results matrix, bio card, buried tray) · TriggersView
    │   ├── pull/    ResearchView · ResearchModules · AskBar · ScrapeLoader
    │   └── ui/      primitives · charts (SVG, no chart lib) · Sheet
    ├── config/
    │   ├── portfolio.ts         # 16 + 4 stocks, 17 categories, glossary
    │   └── routing.ts           # tiers, models, pricing
    ├── data/
    │   ├── seed_data.ts         # single entry point for fallbacks
    │   ├── seed_market.ts  seed_filings.ts  seed_research.ts
    │   └── snapshots/           market.json · filings.json · screener.json (real captures)
    ├── lib/
    │   ├── screenerScraper.ts   # cheerio extraction of all tables, docs, announcements
    │   ├── yahoo.ts  classifier.ts  filings.ts  enrich.ts
    │   ├── research.ts  narrative.ts  qa.ts
    │   ├── llm.ts  cache.ts  http.ts  telemetry.ts  tables.ts  format.ts  client.ts
    └── types/finn.ts            # EODMarketItem, CorporateFiling, PullResearchReport, …
```

---

## Local setup (strictly project-local)

Requires Node.js ≥ 18.18 (tested on Node 26.7 / npm 11.19). Nothing is installed globally.

```bash
cd finn
npm install                 # everything lands in ./node_modules
cp .env.example .env.local  # optional: add GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm run dev                 # http://localhost:3000
```

- **No key?** Leave `GEMINI_API_KEY` empty. Every screen works on Tier 0 plus the real seed snapshots; the header pill shows `Router: Tier 0`.
- **Production check:** `npm run build && npm start`. `npm run typecheck` runs `tsc` alone.
- **Python:** not used. If you add a Python helper later, keep it isolated: `python3 -m venv .venv && source .venv/bin/activate` (Windows: `.venv\Scripts\activate`), then `pip install …` (`.venv/` is git-ignored).
- **Refresh offline seeds:** with `npm run dev` running, run `npm run snapshot` in a second terminal.
- **Deep links:** `/?tab=triggers`, `/?t=POLYCAB` (opens that company's research).

## Try it on your phone

**Same Wi-Fi:**

```bash
npm run dev -- -H 0.0.0.0
ipconfig getifaddr en0        # macOS: prints your LAN IP, e.g. 192.168.1.23
```

Open `http://<that-ip>:3000` on the phone. Use the browser's Share menu → **Add to Home Screen** to open it full-screen.

**Anywhere (tunnel):** in a second terminal, run `npx localtunnel --port 3000` (or `ngrok http 3000`). `npx` runs from a temporary cache, not a global install.

## Deploy to Vercel (≈2 minutes)

```bash
cd finn
git init && git add . && git commit -m "FINN: mobile-first investor intelligence layer"
gh repo create finn --public --source=. --push      # or create the repo on github.com and `git push`
```

1. Go to https://vercel.com/new and import the repo. The framework (Next.js) is detected; no settings to change.
2. Optionally add an environment variable: `GEMINI_API_KEY`.
3. Click **Deploy**. Functions run in `bom1` (Mumbai) per `vercel.json`. Open the URL on a phone.

CLI alternative, no global install: `npx vercel` then `npx vercel --prod`.

---

## Decisions, trade-offs, and what's next

- **Filtering is the product.** Rules-based materiality plus same-event clustering does most of the noise-cancelling for $0; the model only arbitrates what rules can't.
- **Primary sources, auditable.** Every research module links the Screener page, results PDF, annual report and transcripts it used. Q&A refuses to answer beyond them.
- **Honesty over coverage.** Where a company holds no concalls (TRENT, ITC), FINN says so and shows the numbers rather than inventing commentary. Lenders get net margin, and cash conversion is marked "Not Meaningful" for them.
- **Left out deliberately:** intraday data, push notifications, authentication, multi-portfolio support, and LinkedIn scraping (bios come from the filing annexures instead).
- **Next:**
  - Scheduled EOD job and web-push for triggers.
  - Per-user portfolios and thresholds.
  - Transcript tone-shift tracking across quarters.
  - Annual-report RPT / contingent-liability flags.
  - An eval set for the classifier.
