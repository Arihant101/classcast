# ClassCast ☔

When to leave, what to bring, and how to get to class. Built from your class calendar and the forecast.

- Paste up to 5 iCal links and/or upload `.ics` files (merged, de-duplicated, labeled by calendar), then share your location (or type an address)
- For each class: **leave-by time**, route + minutes, weather at that hour, and a bring list
- Assignments and deadlines (e.g. a Canvas feed: all-day or due-at-a-time items) show in a separate **Due** list
- Back-to-back classes are routed from the previous class, with a warning if the gap is too short
- Gemini (or Claude) writes a short daily brief and tailors the bring list

## Run it

```bash
npm install
cp .env.example .env.local   # add keys (both optional)
npm run dev
```

| Env var | Needed? | What happens without it |
| --- | --- | --- |
| `GEMINI_API_KEY` | Optional | Used for the AI brief when set ([free key](https://aistudio.google.com/apikey)) |
| `ANTHROPIC_API_KEY` | Optional | Used if no Gemini key. With neither, a rule-based bring list is still shown |
| `ORS_API_KEY` | Optional | Travel time is a straight-line estimate (dashed on the map) |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-2.5-flash` |
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
                             Gemini/Claude: bring list + brief (schema-checked JSON)
```

## Security notes

- **SSRF:** iCal URLs are user input fetched by the server (each one separately, max 5). `lib/safeFetch.ts` allows only http/https/webcal on default ports, blocks private/loopback/link-local/metadata IPs, checks the IP at connect time (no DNS-rebinding gap), re-checks every redirect (max 3), and caps time (5 s) and size (2 MB).
- **Secrets:** API keys are server-only env vars. Private iCal links work like passwords, so they're never logged or stored.
- **Prompt injection:** calendar text is untrusted. It goes to the model as JSON data with no tools, and the output is schema-validated and length-capped. Times are computed in code, not by the model.
- **XSS:** everything is rendered as text by React; strict-ish CSP and security headers in `next.config.ts`.
- **Abuse:** per-IP rate limit on `/api/plan` (in-memory, per instance).

## Tests

```bash
npm test        # SSRF guard, iCal parsing, multi-calendar merge, leave-by math, AI providers, full API flow (mocked services)
npm run lint && npm run typecheck
```
