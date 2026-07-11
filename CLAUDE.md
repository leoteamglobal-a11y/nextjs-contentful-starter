# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this repo is

This project started life as the **Netlify Next.js + Contentful minimal starter**
(a composable-page CMS demo) and has since been extended into a **real-time
futures scalping terminal** ("GERMAN ZONES TERMINAL") for the Nasdaq micro
future (MNQ). Both stacks live side by side in the same Next.js App Router app:

- **CMS side** — Contentful-backed composable pages rendered from a section →
  component map. This is the original starter and is mostly untouched.
- **Terminal side** — a client-heavy trading UI at `/terminal` with live
  Tradovate market data over WebSocket, a TradingView chart embed, a
  TradingView-webhook signal feed, and two order-flow analysis strategies.

The site root `/` **redirects to `/terminal`** (see `next.config.js`), so the
trading terminal is the effective home page. The CMS pages are still reachable
via their slugs.

## Tech stack

- **Next.js 15.5.19** (App Router, `src/app`), **React 18.3**
- **Tailwind CSS v4** (via `@tailwindcss/postcss`; `styles/globals.css` is just
  `@import 'tailwindcss';`)
- **Contentful** delivery/preview SDK for CMS content
- **Tradovate REST + WebSocket API** for live market data and order routing
- **TradingView** embedded widget (`tv.js`) for charts
- Plain **JavaScript/JSX** — there is no TypeScript in this project
- Deploys to **Netlify** (`netlify.toml`, `@netlify/plugin-nextjs`) and
  **Vercel** (`vercel.json`); Stackbit/Netlify Visual Editor via `stackbit.config.js`

## Commands

```bash
npm install          # install dependencies
npm run dev          # start Next.js dev server (localhost:3000)
npm run build        # production build
npm run start        # serve the production build
npm run import       # import Contentful content models + content (contentful/import.js)
```

There is **no test runner, no typechecker, and no lint script** wired into
`package.json`. Linting config exists (`.eslintrc.json` → `next/core-web-vitals`)
and can be run ad hoc with `npx next lint`. Formatting is Prettier
(`.prettierrc`: 120 print width, single quotes, trailing commas).

## Repository layout

```
src/
  app/
    layout.jsx              # root layout (imports global CSS only)
    page.jsx                # CMS home page — but "/" redirects to /terminal
    [...slug]/page.jsx      # CMS catch-all: renders a Contentful "page" by slug
    terminal/               # ── Trading terminal (client-side) ──
      page.jsx              # server wrapper, sets <title>
      TerminalClient.jsx    # main 'use client' UI: chart, DOM, tape, signals, controls
      useTradovate.js       # Tradovate WS hook: quotes, DOM, tape, positions, placeOrder
      useZoneConfirm.js     # scores a TradingView signal against DOM + tape (0-100)
      useOrderFlow.js       # native FLOW strategy: delta, DOM imbalance, iceberg, absorption
    api/
      signal/
        route.js            # POST webhook — parses TradingView alert text into a signal
        store.js            # in-memory signal store + SSE client registry
        stream/route.js     # GET Server-Sent Events stream of signals
      tradovate/
        auth/route.js       # POST — exchanges credentials for an access token + wsUrl
        order/route.js      # POST — places a market order via Tradovate REST
  components/               # ── CMS section components ──
    Hero.jsx  Stats.jsx  Button.jsx
  utils/
    content.js              # Contentful client + entry → plain-object mapping
contentful/                 # export.json, import/export config, import.js, seed assets
docs/                       # setup screenshots referenced by README
styles/globals.css          # Tailwind entry
```

## CMS side (Contentful composable pages)

- `src/utils/content.js` creates a Contentful client. In **development** it uses
  the **preview** host + `CONTENTFUL_PREVIEW_TOKEN`; in production the **CDN**
  host + `CONTENTFUL_DELIVERY_TOKEN`.
- Pages are Contentful entries of content type **`page`** with a `slug` and a
  `sections` array. `getPageFromSlug` fetches by slug (with a leading-slash
  fallback) and `mapEntry` recursively flattens Contentful entries/assets into
  plain objects.
- `page.jsx` and `[...slug]/page.jsx` render each section by looking its `type`
  up in a `componentMap` (`hero` → `Hero`, `stats` → `Stats`). **To add a new
  section type: create the component, add it to `componentMap` in both files,
  and add a matching content model in Contentful.**
- Components carry `data-sb-object-id` / `data-sb-field-path` attributes for the
  Netlify/Stackbit Visual Editor — preserve these when editing CMS components.

## Terminal side (trading)

`TerminalClient.jsx` is the heart of the app. Key concepts:

- **Live vs. simulation.** `useTradovate` exposes a `status`. When
  `status === 'connected'` the UI is **live** (real quotes, DOM, tape, orders).
  Otherwise it runs a **local simulation** loop (`randomTick`, `simTape`,
  `makeSimBook`) that fakes price/tape/book every 250ms so the UI is fully
  usable without credentials. Order buttons place real Tradovate orders when
  live, or update a local paper position when simulated.
- **Tradovate WebSocket protocol** (`useTradovate.js`) is hand-rolled: framed
  text messages (`endpoint\nid\n\nJSON`), an `o` open frame answered with
  `authorize`, `h` heartbeat frames answered with `[]`, and `a`-prefixed arrays
  of messages. It subscribes to `md/subscribeQuote`, `md/subscribeDOM`,
  `md/subscribeHistogram`, and `user/syncrequest`. Auth and order placement go
  through the server routes (never call Tradovate directly from the client, to
  keep credentials server-side).
- **Signal ingestion.** TradingView alerts POST plain text to `/api/signal`
  (e.g. `LONG EP 21450.25 | SL 21420.00 | TP1 21510.75 | TP2 21600.50`, with
  optional `A+`/`FLIP` flags). `route.js` regex-parses it; `store.js` keeps the
  last 20 in memory and fans out to SSE subscribers; the client consumes
  `/api/signal/stream` via `EventSource` in `useGermanSignals`.
- **Two strategies:**
  - `useZoneConfirm` scores an incoming TradingView zone signal 0-100 against
    DOM walls, tape delta, and block trades → green/yellow/red confirmation.
  - `useOrderFlow` ("FLOW NATIVO") generates its own LONG/SHORT signals from DOM
    imbalance, delta flips, iceberg detection, and absorption blocks, graded
    A+/B/C.
- **UI language.** Terminal-facing strings are in **Spanish** (locale `es`);
  the TradingView widget also uses `locale: 'es'`. Match this when editing
  terminal UI copy. CMS components and code identifiers are in English.

### Important caveats

- **In-memory state does not survive across serverless instances.** The signal
  `store.js` (`signals`, `clients`) is a module-level array. On Netlify/Vercel
  serverless, the webhook POST and the SSE `GET` may hit different instances, so
  signals can be lost. `vercel.json` extends the SSE function `maxDuration` to
  300s to keep streams alive, but this remains a single-instance assumption. If
  you make signals durable, replace the in-memory store with an external
  pub/sub (e.g. Redis, Upstash, a queue) rather than growing the module global.
- **Symbols and constants** are configured via `NEXT_PUBLIC_*` env vars with
  in-code fallbacks (`SYMBOL`, `TICK`, `TICK_VALUE`, `SIM_BASE`, chart symbol
  list). CME futures symbols in the TradingView embed require a TV login; the
  CFD/index symbols (`US100`, `NDX`, `NAS100`) load without login and are the
  defaults.
- **`isAutomated: false`** is set on placed orders — keep this unless you have
  the regulatory/exchange approval that automated order flags require.

## Environment variables

Copy `.env.example` to `.env` and fill in. Never commit `.env` (it is gitignored;
only `.env.example` is tracked).

| Variable | Purpose |
| --- | --- |
| `CONTENTFUL_SPACE_ID` | Contentful space |
| `CONTENTFUL_MANAGEMENT_TOKEN` | used by `npm run import` and Stackbit |
| `CONTENTFUL_DELIVERY_TOKEN` | production content fetch |
| `CONTENTFUL_PREVIEW_TOKEN` | dev/preview content fetch |
| `TRADOVATE_ENV` | `demo` (default) or `live` — selects REST/WS host |
| `TRADOVATE_USERNAME` / `TRADOVATE_PASSWORD` | Tradovate login |
| `TRADOVATE_APP_ID` / `TRADOVATE_CID` / `TRADOVATE_SEC` | Tradovate API app creds |
| `NEXT_PUBLIC_TRADE_SYMBOL` | traded contract, e.g. `MNQM5` |
| `NEXT_PUBLIC_TV_SYMBOL` | TradingView chart symbol |
| `NEXT_PUBLIC_TICK_VALUE` | $ per tick (0.5 for MNQ) |
| `NEXT_PUBLIC_SIM_BASE` | simulation base price (optional) |

## Conventions & guidance for changes

- **JavaScript/JSX only** — do not introduce TypeScript. Match the existing
  functional-component + hooks style.
- **Formatting:** single quotes, 120-column lines, trailing commas (Prettier).
- **Client vs. server:** anything using browser APIs, `useState`/`useEffect`,
  WebSocket, or `EventSource` needs `'use client'`. Keep Tradovate credentials
  and any secret-bearing fetches inside `src/app/api/*` route handlers.
- **Contentful secrets** must stay server-side; the CMS fetch happens in async
  server components via `src/utils/content.js`.
- When touching CMS section components, keep the `data-sb-*` visual-editor
  attributes intact.
- There is no automated test/lint gate; verify changes by running `npm run dev`
  and exercising the affected page (`/terminal` for trading, a CMS slug for
  content). For terminal changes, the simulation mode lets you test without
  Tradovate credentials.

## Git workflow

- Active development branch for this task: `claude/claude-md-docs-qf6u8o`.
- Do all work on the designated branch, commit with clear messages, and push
  with `git push -u origin <branch>`. Do **not** open a PR unless explicitly
  asked.
- `renovate.json` extends the Netlify shared Renovate config for dependency
  updates.
