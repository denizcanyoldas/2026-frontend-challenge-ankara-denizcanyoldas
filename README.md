# Jotform Frontend Challenge Project

## User Information
- **Name**: Deniz Can Yoldaş

## Project Description
Investigation dashboard for the scenario **“Missing Podo: The Ankara Case”**.

This app fetches submissions from multiple Jotform forms (Checkins, Messages, Sightings, Personal Notes, Anonymous Tips) via a **server-side API proxy** (so your API key stays private), normalizes them into a unified event stream, links records by person, and provides:
- People browser + search/filter
- Event list + detail view (including raw JSON)
- Timeline view (bonus)

## Tech
- Next.js (App Router) + TypeScript
- Tailwind CSS

## Getting Started

### 1) Install
```bash
npm install
```

### 2) Configure environment variables
Create a `.env.local` file at the repo root:

```bash
JOTFORM_API_KEY=your_api_key_here
JOTFORM_FORM_CHECKINS=261065067494966
JOTFORM_FORM_MESSAGES=261065765723966
JOTFORM_FORM_SIGHTINGS=261065244786967
JOTFORM_FORM_PERSONAL_NOTES=261065509008958
JOTFORM_FORM_ANON_TIPS=261065875889981
```

Notes:
- **Do not commit** `.env.local` or `data_and_keys.txt`.
- The API key is used only on the server via Next.js route handlers.

### 3) Run
```bash
npm run dev
```

Open `http://localhost:3000`.

## Jotform API
- API docs: `https://api.jotform.com/docs/`
