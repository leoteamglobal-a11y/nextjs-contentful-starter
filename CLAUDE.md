# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this project is

This started as the **Netlify Next.js + Contentful minimal starter** (a
composable-page marketing site driven by Contentful), and has been extended
into a **real-time futures trading terminal** for scalping Nasdaq micro futures
(MNQ/NQ). Both halves live in the same Next.js App Router app:

- **Contentful CMS site** — composable pages (`hero`, `stats` sections) rendered
  from Contentful, editable with the Netlify Visual Editor (Stackbit).
- **Trading terminal** (`/terminal`) — a client-heavy dashboard with a
  TradingView chart, live Tradovate market data over WebSocket, order flow
  analytics, and TradingView-webhook signal ingestion.

Note: the site's root path (`/`) **redirects to `/terminal`** (see
`next.config.js`), so the trading terminal is what loads at the bare domain. The
Contentful-driven home page code still exists at `src/app/page.jsx` but is not
reached unless the redirect is removed.

Much of the terminal UI copy is in **Spanish** — match that when editing
terminal strings.

## Tech stack

- **Next.js 15.5.x** (App Router, `src/app`)
- **React 18.3**
- **Tailwind CSS v4** (via `@tailwindcss/postcss`; `styles/globals.css` is just
  `@import 'tailwindcss';`)
- **Contentful** delivery/preview SDK (`contentful` package) for CMS content
- **Stackbit / Netlify Visual Editor** (`@stackbit/cms-contentful`)
- **JavaScript only** — no TypeScript. Files are `.jsx` / `.js`.
- Deploy targets: **Netlify** (`netlify.toml`, `@netlify/plugin-nextjs`) and
  **Vercel** (`vercel.json`).

## Commands

```bash
npm install        # install dependencies
npm run dev        # start Next.js dev server (localhost:3000)
npm run build      # production build
npm run start      # serve the production build
npm run import     # import content models + content into Contentful (contentful/import.js)
```

There is **no test runner and no separate lint script** in `package.json`.
Linting is available through Next's built-in ESLint config (`.eslintrc.json`
extends `next/core-web-vitals`) if you run `npx next lint`. Do not claim tests
pass — there are none.

For the Visual Editor locally: run `npm run dev` in one shell and
`stackbit dev` (needs `npm i -g @stackbit/cli`) in another.

## Directory layout

```
src/
  app/
    layout.jsx              # root layout (imports global CSS)
    page.jsx                # Contentful home page (bypassed by / → /terminal redirect)
    [...slug]/page.jsx      # Contentful catch-all dynamic pages
    terminal/
      page.jsx              # /terminal server entry (metadata)
      TerminalClient.jsx    # main terminal UI ('use client') — chart, DOM, tape, signals, controls
      useTradovate.js       # WebSocket hook: auth, market data, positions, placeOrder
      useOrderFlow.js       # native order-flow strategy (delta, DOM imbalance, iceberg)
      useZoneConfirm.js     # scores a webhook signal against live DOM + tape
    api/
      signal/
        route.js            # POST webhook from TradingView alerts (parses text → signal)
        store.js            # in-memory signal store + SSE client registry
        stream/route.js     # GET Server-Sent Events stream of signals
      tradovate/
        auth/route.js       # POST → Tradovate access token + ws URL (server-side creds)
        order/route.js      # POST → place a market order via Tradovate REST
  components/               # Contentful section components (Hero, Stats, Button)
  utils/content.js          # Contentful client + entry mapping helpers
contentful/                 # import script, export.json content, config, assets
styles/globals.css          # Tailwind entrypoint
docs/                       # README screenshots
```

## Two subsystems

### 1. Contentful composable pages

- `src/utils/content.js` creates a Contentful client. It uses the **preview**
  token + `preview.contentful.com` in development (`NODE_ENV === 'development'`)
  and the **delivery** token + `cdn.contentful.com` in production.
- Content type `page` has a `slug` and a list of `sections`. `getPageFromSlug`
  fetches by slug (trying with and without a leading `/`); `mapEntry` recursively
  flattens Contentful entries/assets into plain objects.
- `page.jsx` and `[...slug]/page.jsx` map each section's `type` to a component
  via `componentMap` (`hero` → `Hero`, `stats` → `Stats`). **To add a new section
  type**: create the component in `src/components/`, register it in *both*
  `componentMap` objects, and add the matching content model in Contentful.
- Components carry `data-sb-object-id` / `data-sb-field-path` attributes — these
  power Netlify Visual Editor inline editing. **Preserve them** when editing
  section components.
- `stackbit.config.js` wires Contentful into the Visual Editor and defines the
  `page` model's `urlPath` as `/{slug}`.

### 2. Trading terminal (`/terminal`)

`TerminalClient.jsx` is the hub. Key behaviors:

- **Live vs. simulation.** If Tradovate is connected (`tv.status === 'connected'`)
  it uses live quote/DOM/tape data; otherwise it runs a **local simulation loop**
  (random-walk price, synthetic tape and order book) so the UI works without
  credentials. `SIM_BASE` (env `NEXT_PUBLIC_SIM_BASE`, ~29900) seeds the sim
  price to roughly track real Nasdaq.
- **Instrument constants:** `SYMBOL` (`NEXT_PUBLIC_TRADE_SYMBOL`, default
  `MNQM5`), `TICK` = 0.25, `TICK_VALUE` (`NEXT_PUBLIC_TICK_VALUE`, default $0.50
  for MNQ).
- **Chart** is a TradingView embed injected via `s3.tradingview.com/tv.js`. A
  symbol switcher (`CHART_SYMBOLS`) defaults to CFD/index feeds (US100, NDX) that
  load without a TradingView login; NQ/MNQ futures feeds require a TV login.
- **Order placement** goes through `useTradovate.placeOrder` in live mode, or
  updates local position/P&L state in sim mode. `goLong`, `goShort`, `flatten`,
  and `executeSignal` are the entry points.

**`useTradovate.js`** — connects to the Tradovate WebSocket. It POSTs to
`/api/tradovate/auth` for a token + ws URL, then speaks Tradovate's line-framed
protocol (`o`/`h`/`c`/`a` frames; `endpoint\nid\n\nbody` messages). It subscribes
to quotes, DOM, and tick histogram, syncs positions, and exposes
`{ status, quote, dom, tape, positions, placeOrder, connect, disconnect }`.

**`useOrderFlow.js`** — the native "FLOW" strategy. Computes cumulative delta from
the tape, DOM bid/ask imbalance, iceberg detection, and recent block trades, then
scores LONG/SHORT (thresholds: signal at score ≥ 55 with ≥ 2 reasons; grades A+
≥ 80, B ≥ 65, C otherwise). Tunable constants at the top: `IMBALANCE_RATIO`,
`DELTA_FLIP_MIN`, `ABSORPTION_BARS`, `BLOCK_SIZE`.

**`useZoneConfirm.js`** — given an incoming TradingView "German Zones" signal plus
live DOM and tape, scores 0–100 (DOM wall 30 pts, tape delta 40 pts, block trades
30 pts) and returns green/yellow/red confirmation. The UI disables the execute
button when confirmation is red.

**Signal webhook + SSE pipeline:**
- TradingView alerts POST plain text to `/api/signal` in the form
  `LONG EP 21450.25 | SL 21420.00 | TP1 21510.75 | TP2 21600.50` (also `SHORT`;
  `A+` and `FLIP` flags recognized). `route.js` parses it into a signal object.
- `store.js` holds an **in-memory** array of the last 20 signals and a `Set` of
  connected SSE clients. `pushSignal` fans out to all clients.
- `stream/route.js` is an SSE endpoint (`text/event-stream`) that replays existing
  signals on connect and streams new ones, with a 15s heartbeat. The client hook
  `useGermanSignals` in `TerminalClient.jsx` consumes it via `EventSource`.
- **Caveat:** the store is in-process memory. On serverless/multi-instance
  deploys (Netlify/Vercel) a webhook POST and an SSE connection may land on
  different instances, so signals will not reliably reach the browser. This is a
  known limitation — a shared store (Redis/KV/etc.) is needed for reliable
  production delivery. `vercel.json` raises the SSE route's `maxDuration` to 300s.

## Environment variables

Copy `.env.example` to `.env`. Contentful keys are required for the CMS pages;
Tradovate keys are required only for *live* terminal trading (the terminal runs
in simulation without them).

| Variable | Purpose |
| --- | --- |
| `CONTENTFUL_SPACE_ID` | Contentful space |
| `CONTENTFUL_MANAGEMENT_TOKEN` | used by `npm run import` and Stackbit |
| `CONTENTFUL_DELIVERY_TOKEN` | production content fetch |
| `CONTENTFUL_PREVIEW_TOKEN` | dev/preview content fetch |
| `TRADOVATE_ENV` | `demo` (default) or `live` — selects API + ws host |
| `TRADOVATE_USERNAME` / `TRADOVATE_PASSWORD` | Tradovate login (server-side only) |
| `TRADOVATE_APP_ID` / `TRADOVATE_CID` / `TRADOVATE_SEC` | Tradovate API app credentials |
| `NEXT_PUBLIC_TRADE_SYMBOL` | traded contract symbol (default `MNQM5`) |
| `NEXT_PUBLIC_TV_SYMBOL` | TradingView chart symbol |
| `NEXT_PUBLIC_TICK_VALUE` | dollar value per tick (default `0.5`) |
| `NEXT_PUBLIC_SIM_BASE` | simulation base price (optional) |

**Never** hardcode or commit secrets. `.env*` is gitignored except
`.env.example`. Tradovate credentials are read only in server route handlers
(`api/tradovate/*`) and never exposed to the client — keep it that way. Only
`NEXT_PUBLIC_*` values reach the browser.

## Conventions

- **Formatting** (`.prettierrc`): single quotes, trailing commas (`all`),
  `printWidth` 120.
- **Components** are function components; Contentful section components are named
  exports (`export const Hero = ...`), terminal files use default exports.
- Any file using React hooks, browser APIs, `EventSource`, or `WebSocket` must be
  a Client Component — start it with `'use client'` (see the `terminal/*` files).
- API route handlers export `POST`/`GET` and return `Response.json(...)`.
- Keep Spanish-language UI copy in the terminal consistent with existing strings.
- No test framework is configured; verify changes by running `npm run build`
  and/or `npm run dev` and exercising the affected page.

## Git workflow

- Active development branch for this work: `claude/claude-md-docs-gg3jxf`.
- Default branch: `main`.
- Commit with clear messages; push with `git push -u origin <branch>`.
- Do not open a pull request unless explicitly asked.
