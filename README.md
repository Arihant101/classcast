# ClassCast ☔

> **HackPSU snapshot.** This branch (and tag `hackpsu-v1`) is the version submitted to HackPSU on Oct 25, 2026. It's frozen; ongoing work happens on [`main`](https://github.com/Arihant101/classcast/tree/main).

When to leave, what to bring, and how to get to class. Built from your class calendar and the forecast.

- Paste up to 5 iCal links (e.g. LionPATH + Canvas) or drag in `.ics` files. They're merged, de-duplicated, and labeled by calendar. Then share your location (or type an address)
- For each class: **leave-by time**, route + minutes, weather at that hour, and a bring list
- Assignments and deadlines (e.g. a Canvas feed: all-day or due-at-a-time items) show as bullet points in a separate **Due** list
- Back-to-back classes are routed from the previous class, with a warning if the gap is too short
- **Reality Check** (week view): busiest day, risky back-to-backs, rainy days, and free windows of 90+ minutes
- A short daily brief and tailored bring list: from AI (Gemini, Groq or Claude) when a key works, otherwise from built-in rules, so **no paid key is needed**
- **Save as PDF** (print styles) or send the plan with **Gmail / Email** (prefilled plain text, nothing sent through the server)
- shadcn/ui (Base UI) with a red-orange and cyan theme, light/dark mode, and wrapping for long calendar text

## Run it

```bash
npm install
cp .env.example .env.local   # add keys (both optional)
npm run dev
```

| Env var | Needed? | What happens without it |
| --- | --- | --- |
| `GEMINI_API_KEY` | Optional | Used for the AI brief when set ([free key](https://aistudio.google.com/apikey)) |
| `GROQ_API_KEY` | Optional | Tried next ([free key](https://console.groq.com/keys), no billing needed) |
| `ANTHROPIC_API_KEY` | Optional | Tried last. With no working key, the brief and bring list come from rules |
| `ORS_API_KEY` | Optional | Travel time is a straight-line estimate (dashed on the map) |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-2.5-flash` |
| `GROQ_MODEL` | Optional | Defaults to `llama-3.3-70b-versatile` |
| `CLAUDE_MODEL` | Optional | Defaults to `claude-haiku-5-5` |
| `CAMPUS_CENTER` | Optional | Geocoding bias, defaults to Penn State University Park (`40.7982,-77.8599`) |

Get a free OpenRouteService key at https://openrouteservice.org/dev/#/signup.

## Deploy (Vercel)

1. Import this repo in Vercel (framework preset: Next.js)
2. Add the env vars above under **Settings → Environment Variables** (never prefix them with `NEXT_PUBLIC_`)
3. If you use a paid key, set a spend limit in its console

## How it works

```
browser ──POST /api/plan──▶ safeFetch (iCal) ─▶ parse + expand repeats
                             geocode (GEO → Nominatim → Open-Meteo)
                             Open-Meteo hourly forecast (one call)
                             OpenRouteService route per leg
                             leave-by = start − travel × weather − 5 min
                             Reality Check: weekly summary (week view)
                             Gemini → Groq → Claude → rules: bring list + brief
```

## Security notes

- **SSRF:** iCal URLs are user input fetched by the server (each one separately, max 5). `lib/safeFetch.ts` allows only http/https/webcal on default ports, blocks private/loopback/link-local/metadata IPs, checks the IP at connect time (no DNS-rebinding gap), re-checks every redirect (max 3), and caps time (5 s) and size (2 MB).
- **Secrets:** API keys are server-only env vars. Private iCal links work like passwords, so they're never logged or stored.
- **Prompt injection:** calendar text is untrusted. It goes to the model as JSON data with no tools, and the output is schema-validated and length-capped. Times are computed in code, not by the model.
- **XSS:** everything is rendered as text by React. A per-request nonce CSP (`proxy.ts`) blocks injected scripts, plus HSTS and other headers in `next.config.ts`.
- **Abuse:** per-IP rate limit on `/api/plan` (in-memory, per instance).
- **Privacy:** Vercel Web Analytics counts page views only. Calendar links travel in the POST body, never in URLs, so they never reach analytics or logs.

## Tests

```bash
npm test        # SSRF guard, iCal + Canvas parsing, multi-calendar merge, leave-by math, Reality Check, AI providers, full API flow (mocked services)
npm run lint && npm run typecheck
```

## Project layout

| Path | What it does |
| --- | --- |
| `app/page.tsx` | Planner UI (form, plan, PDF/email export) |
| `app/api/plan/route.ts` | The one API route: calendars → geocode → weather → routes → AI |
| `lib/safeFetch.ts` | SSRF-safe calendar fetcher |
| `lib/ical.ts`, `lib/calendars.ts` | Parse, classify (class vs. due), merge and dedupe calendars |
| `lib/leaveTime.ts`, `lib/weekSummary.ts` | Leave-by math and the Reality Check |
| `lib/ai.ts`, `lib/templatePlan.ts` | AI brief (schema-checked) and the no-key rule-based fallback |
| `components/ui/` | shadcn/ui components (Base UI) |

## Credits

Weather: [Open-Meteo](https://open-meteo.com) · Maps and geocoding: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · Routes: [openrouteservice](https://openrouteservice.org) · Built for HackPSU.
