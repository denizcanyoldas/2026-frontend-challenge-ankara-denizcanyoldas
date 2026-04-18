# Jotform Frontend Challenge Project

## User Information
- **Name**: Deniz Can Yoldaş

## Project Description
Investigation dashboard for the scenario **“Missing Podo: The Ankara Case”**.

This app turns five separate Jotform forms into a single, coherent investigation workspace. Raw submissions from **Checkins**, **Messages**, **Sightings**, **Personal Notes**, and **Anonymous Tips** are pulled server-side, normalized into a unified `EventItem` stream, linked into per-person timelines, and surfaced through a map-first UI that lets an operator answer the only question that matters: *where did Podo go, and who was with him?*

Core capabilities:
- **Server-side API proxy** (Next.js Route Handlers at `/api/jotform/**`) so your Jotform API key never reaches the browser. Responses are cached in-process for 15 s to soften refresh spam and to coexist politely with Jotform's per-minute rate limits.
- **Person linking with fuzzy deduplication.** "Kagan", "Kağan" and "Kağan A." are collapsed into a single canonical identity via Turkish-aware normalization, Levenshtein distance, and a "shared meaningful token" rule. See `src/lib/linking/dedupe.ts`.
- **Fuzzy search** across people and locations (powered by [Fuse.js](https://fusejs.io/)) — so `Atatkule` still finds `Atakule`. Fuzzy misses fall back to substring matching for very short queries.
- **People browser** with multi-select, "Select all / Clear", and single-click vs. double-click semantics (add vs. replace selection).
- **Events panel** with list and timeline views, source + location filters, and a detail card that toggles between a human-readable answer table (`EventDetails.tsx`) and raw JSON.
- **Interactive Leaflet map** with numbered per-person pins (1, 2, 3, … starting from each person's first physical stop), unique per-person trail colors with dashed polylines, halo emphasis on highlighted trails, collision-ring offsetting when different people sit on the same coordinate, and an "×N" badge when multiple events share a pin.
- **Double-click an event to pinpoint it.** The map smoothly pans/zooms to the marker, opens its popup, selects only that event's owner, and dims every other pin (spotlight mode). A `requestAnimationFrame` retry loop makes this safe even while the map is mid-rebuild.
- **Suspect scoring engine** (`src/lib/analysis/suspects.ts`) that ranks every non-victim using four interpretable signals — co-location (±6 h / ~400 m → 2 pts each), co-mention with Podo in any record (3 pts), being named in anonymous tips (3 pts), and a one-shot "closest to the last known Podo location" bonus (5 pts). Results are shown at the bottom of the page as a podium-ranked board with per-signal breakdown chips.
- **Responsive UI** tuned from 320 px phone widths up through desktop, with subtle motion (animated gradient hero, floating orbs, shimmer on the prime suspect's progress bar, staggered pop-in for the ranked list). Everything motion-related is gated by `@media (prefers-reduced-motion: reduce)`.

Bonus features implemented beyond the base brief:
- People browser + search/filter
- Event list + detail view (including raw JSON)
- Timeline view (bonus)

## Tech
- **Next.js 16** (App Router, React Server Components, Turbopack dev server) + **React 19**
- **TypeScript 5** in strict mode across the entire codebase
- **Tailwind CSS v4** (via `@tailwindcss/postcss`) with a custom design-token layer in `src/app/globals.css`
- **Leaflet 1.9** for the map, with dynamic client-only import (`next/dynamic` + `ssr: false`) so no map code ever runs on the server
- **Fuse.js 7** for fuzzy person and location search
- **ESLint 9** with `eslint-config-next` (React Compiler rules enabled)
- No database and no external state manager — the client holds all interaction state in React, and the server is a thin cached proxy over the Jotform REST API

## Getting Started

Before you clone, make sure you have:

- **Node.js ≥ 20.x** (the project is built and tested on Node 20 LTS and 22). Check with `node -v`. If you manage Node with `nvm`, `fnm`, or `volta`, Node 20+ will work.
- **npm ≥ 10** (bundled with Node 20+). `pnpm` and `yarn` also work but `package-lock.json` is committed for npm.
- **Git**, plus a terminal. On Windows, PowerShell 7, Windows Terminal, or Git Bash all work equally well; the commands below are portable.
- **A Jotform account** with at least one **API key**. Create or retrieve one at <https://www.jotform.com/myaccount/api> — use a key with at least `Read` scope on the five forms listed below. A single free-tier key is enough to run the demo; adding a second key unlocks automatic failover on `429` rate limits.
- Roughly **300 MB of free disk** for `node_modules` and the Next.js dev cache.

### 1) Install
```bash
git clone https://github.com/denizcanyoldas/2026-frontend-challenge-ankara-denizcanyoldas jotform-hackathon
cd jotform-hackathon
npm install
```

`npm install` fetches Next.js, React 19, Tailwind v4, Leaflet, Fuse.js and their dev-time tooling. On a fresh machine it takes ~30–60 s depending on bandwidth. There are no native dependencies, so no Visual Studio / Xcode toolchain is required.

If you prefer `pnpm` or `yarn`, delete `package-lock.json` first and use `pnpm install` or `yarn install` — the code is package-manager-agnostic.

### 2) Configure environment variables
Create a `.env.local` file at the repo root (same directory as `package.json`). Next.js reads `.env.local` automatically, both in `npm run dev` and `npm run build`, and only vars prefixed with `NEXT_PUBLIC_` are exposed to the browser — none of ours are, so your API key is only ever read inside server Route Handlers.

```bash
# One key:
JOTFORM_API_KEY=your_api_key_here

# Or multiple keys (comma-separated) for automatic fail-over on 429:
# JOTFORM_API_KEYS=key1,key2,key3

# Form IDs are built-in defaults but can be overridden:
# JOTFORM_FORM_CHECKINS=261065067494966
# JOTFORM_FORM_MESSAGES=261065765723966
# JOTFORM_FORM_SIGHTINGS=261065244786967
# JOTFORM_FORM_PERSONAL_NOTES=261065509008958
# JOTFORM_FORM_ANON_TIPS=261065875889981
```

How the vars are used:

- `JOTFORM_API_KEY` / `JOTFORM_API_KEYS` — parsed by `parseApiKeysFromEnv()` in `src/lib/jotform.ts`. Whitespace, commas, and duplicates are handled; if both are set, the two lists are merged and de-duplicated. If neither is set, the API route returns `500 { error: "Missing server env var JOTFORM_API_KEY …" }` and the UI shows the red failure banner.
- `JOTFORM_FORM_*` — per-source overrides wired through `getFormIdForSource()` in `src/lib/sources.ts`. The **defaults shown above match the hackathon's published form IDs**, so for a standard run you can leave all five commented out.

Key rotation and caching behavior (no configuration required, but good to know while testing):

- If a call returns `429 Too Many Requests`, the server marks that key as "cooling down" for 60 s and transparently retries the same call with the next configured key. When every key is cooling down, the route responds with an error that includes the last Jotform body so you can see the underlying message.
- Successful Jotform responses are cached in a process-local `Map` for 15 s with `formId + limit + offset` as the cache key. Restarting `npm run dev` clears it.

Security reminders:

- **Never commit `.env.local`** — it is in `.gitignore`.
- **Never commit `data_and_keys.txt`** (a local scratchpad used during development) — also ignored.
- The browser only ever sees `/api/jotform/all` JSON; it cannot read your key.

### 3) Run
```bash
npm run dev
```

This boots Next.js on <http://localhost:3000> using Turbopack. The first page load triggers `GET /api/jotform/all`, which fans out to all five forms in parallel (`Promise.all`), paginates (`limit=200`, up to 25 pages per form), normalizes each submission into an `EventItem`, sorts the whole set by `createdAt` descending, and returns JSON. Expect the first refresh after startup to take 1–4 s while the cache warms; subsequent refreshes within the 15 s cache window are instant.

If port 3000 is busy, Next will prompt for the next free port (typically 3001). You can force a port with:

```bash
npm run dev -- -p 4000
```

Other useful scripts (from `package.json`):

```bash
npm run build    # production build with type-check
npm run start    # serve the production build
npm run lint     # ESLint (next/core-web-vitals + React Compiler rules)
npx tsc --noEmit # standalone TypeScript check
```

Smoke-test endpoints once the dev server is running:

- `http://localhost:3000/` — the full dashboard.
- `http://localhost:3000/api/jotform/all` — the aggregated JSON the UI consumes; handy for verifying your API key works.
- `http://localhost:3000/api/jotform/forms/261065244786967/submissions` — raw submissions for a single form (replace the numeric id). Returns `400` for a non-numeric id, `500` if no API key is set, `502` if every retry/rotation fails.

Common pitfalls and how to resolve them:

- **The "5 sources" strip shows all zeros and a yellow "Partial data" banner lists errors.** Your API key is wrong, revoked, or lacks access to the form. Open `/api/jotform/all` directly to read the underlying error; regenerate or switch to a working key in `.env.local` and hit the **Refresh** button (no dev server restart needed — Next.js reads `.env.local` on each request during dev).
- **Everything 429s.** Add a second key to `JOTFORM_API_KEYS`; the server will rotate and cool each key for 60 s on limit hits.
- **The map stays empty.** No submissions produced parseable coordinates yet. The map falls back to Ankara (39.92, 32.85) and shows a dashed "No coordinates available yet" card above the trail panel.
- **"Map container is already initialized" in the console during hot reload.** Safe to ignore — the `MapView` init/cleanup effect is idempotent and the next refresh will be clean.

## Jotform API
- API docs: `https://api.jotform.com/docs/`
- Account / API key management: <https://www.jotform.com/myaccount/api>
- Relevant endpoints consumed by this app (all via the server proxy, never directly from the browser):
  - `GET https://api.jotform.com/form/{formId}/submissions?limit={limit}&offset={offset}` — paginated submissions for a given form, authenticated via the `APIKEY` header. Wrapped in `fetchAllFormSubmissions()` in `src/lib/jotform.ts`, which handles key rotation, 429 cooldown, pagination (default `limit=200`, `maxPages=25`), and a 15 s in-memory cache.
- The five form IDs used by default are the public hackathon forms for the "Missing Podo: The Ankara Case" scenario; override them with `JOTFORM_FORM_*` env vars to point at your own copies without touching any code.
