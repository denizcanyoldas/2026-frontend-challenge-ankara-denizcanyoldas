# Jotform Frontend Challenge Project

## User Information
- **Name**: Deniz Can Yoldaş

## Project Description
Investigation dashboard for **“Missing Podo: The Ankara Case”**.

Fetches submissions from five Jotform forms (Checkins, Messages, Sightings, Personal Notes, Anonymous Tips) through a server-side proxy so the API key never reaches the browser. Normalizes everything into a unified event stream, dedupes near-duplicate identities (Turkish-aware, e.g. *Kağan* ≡ *Kagan A.*), links records per person, and ships:

- People browser with fuzzy search + multi-select
- Event list / timeline with readable table + raw JSON toggle
- Leaflet map: numbered per-person pins, unique trail colors, collision offset, double-click to pinpoint + spotlight
- Suspect scoring board ranking who is most likely responsible (co-location, co-mentions, anonymous tips, last-seen proximity)

## Tech
- Next.js 16 (App Router) + React 19 + TypeScript 5
- Tailwind CSS v4
- Leaflet, Fuse.js

## Getting Started

Requires Node ≥ 20 and a Jotform API key (<https://www.jotform.com/myaccount/api>).

### 1) Install
```bash
npm install
```

### 2) Configure environment variables
Create `.env.local` at the repo root:

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

### 3) Run
```bash
npm run dev
```

Open <http://localhost:3000>.

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Jotform API
- Docs: <https://api.jotform.com/docs/>
- All calls go through `/api/jotform/all` (aggregated) and `/api/jotform/forms/[formId]/submissions` (single form). Rate-limited calls rotate across configured keys automatically.
