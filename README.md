# SeaSarathi (सागर सारथी) — Marine Intelligence Platform

> **Safe, explainable marine intelligence for Indian fishermen, in their own language and voice.**

SeaSarathi is a mobile app plus a cloud AI backend. A fisherman asks a question by text or voice
("Is it safe to go out tomorrow?", "Where is the nearest fishing zone?") and gets an answer in the
same language, together with the data and timestamps behind it. It fuses satellite ocean data
(Copernicus), official warnings (IMD, INCOIS) and weather forecasts (Open-Meteo) into one simple
status: **Danger, Be careful, or No warnings**.

**Design principle:** *not an LLM chatbot.* Safety decisions come from deterministic rules on real,
timestamped data. The LLM helps with language and explanation, and is deliberately boxed in so it
cannot invent advice (see [Alerts pipeline](#the-alerts-pipeline)).

---

## Status

| Area | State |
|---|---|
| Mobile app (Android APK via Expo EAS) | Built |
| Backend API + background data refresh | Built, **deployed 24x7 on AWS** (see [deploy/AWS.md](deploy/AWS.md)) |
| 10 languages (UI + chat + voice) | Built |
| Safety assessment, PFZ, alerts, geofencing, offline fallback | Built |
| Marine protected areas, route optimization, productivity-trend analysis | **Not built yet** — see [Roadmap](#roadmap-not-built-yet) |

---

## Key features (built)

- **Multilingual chat and voice.** English, Hindi, Marathi, Tamil, Telugu, Malayalam, Bengali,
  Gujarati, Odia and Kannada. The query language is auto-detected and answered in kind (Sarvam
  speech-to-text, LLM and text-to-speech). Chat is **multi-turn**: the last 3 exchanges are sent
  with each question, so a follow-up like "and how far is it?" is understood in context (history is
  capped and treated as untrusted; safety verdicts always come from current data, never from it).
- **Time-aware questions.** "Is it safe tomorrow morning?", "tonight", "day after tomorrow", "next 24
  hours" (English plus the main time words of the other 9 languages, in IST) are answered from the
  forecast for that period; a question that names no time uses the next 12 hours. If the 3-day
  forecast doesn't reach the period, the answer says so.
- **Tide.** Ask "when is the next low tide?" (or in any of the 10 languages) for the current level,
  whether the water is rising or falling, and the next highs and lows. It comes from the hourly
  sea-level forecast in the same Open-Meteo marine call used for waves — a model estimate at about
  8 km and 1-hour resolution, so the answer says it is not an official tide table.
- **Safety assessment.** Deterministic rules over wind, waves, rain, thunderstorm and cyclone data
  produce a risk score: `>= 70` SAFE, `40-69` CAUTION, `< 40` DO NOT VENTURE (for example wind above
  46 km/h or waves above 3.5 m are high risk).
- **Alerts screen.** One big level card (Danger / Be careful / No warnings), a key-facts card (wind,
  gusts, swell height and period, place, times, and IMD's own advice quoted verbatim) and compact
  cards with a "More details" toggle. It never says "No warnings" on cached data, an unreachable
  IMD, or an expired bulletin.
- **Potential Fishing Zones (PFZ).** Nearest of 52 PFZ polygons with distance, direction, estimated
  arrival time, sea temperature, chlorophyll and a confidence score. Each zone is marked *within* or
  *beyond* the boat's range: small 9 km, medium 22 km, large 370 km, union fleet 500 km. When no
  official zone is near, an estimated local zone is offered for small boats.
- **Map and geofencing.** Google Map with a risk heatmap (low / moderate / high), India's EEZ and 17
  international-boundary features. Alerts fire within **50 km** (caution) and **15 km** (danger) of an
  international boundary.
- **Coastal news.** IMD bulletins grouped by coastal zone (Gujarat-Maharashtra, Goa-Karnataka-Kerala,
  Tamil Nadu-Puducherry, Andhra-Odisha, West Bengal).
- **Offline fallback.** The last forecast, geofence status and map geometry are cached on the phone
  and used when the network fails, with a clear "offline" banner.
- **Explainable.** Recommendations show their source and issue time.

### Screens

Dashboard · Compass · Chat · Map · PFZ · Alerts · Profile (vessel type, home port, language, risk
tolerance) · Auth/onboarding.

---

## Architecture

```
Phone app (React Native / Expo)
    | HTTPS  +  x-api-key header
    v
Caddy (automatic HTTPS)  ->  FastAPI (uvicorn, one worker)   [AWS Lightsail, Mumbai]
                               |
                               |-- LangGraph agents:  planner -> data -> risk -> response
                               |-- routers: chat, voice, alerts, news, pfz, ocean, geofence,
                               |            landing, imd, offline, profile, data, geojson, health
                               |-- background loops (run 24x7, even when nobody uses the app):
                               |     * Copernicus SST/chlorophyll grid  (re-fetched when > 6 h old)
                               |     * IMD scrapers: fisherman warnings, sea-area bulletins,
                               |       cyclone warnings  (refreshed every 1-6 h)
                               `-- storage: SQLite (profiles), GeoJSON (static), JSON (ocean grid)

External: IMD, INCOIS, Copernicus Marine, Open-Meteo, Sarvam AI, Google Maps
```

### Agents

`backend/src/agents/graph.py` is a LangGraph state graph: **planner** (intent + location; Sarvam LLM
with a rule-based fallback; intents SAFETY, PFZ, ALERT, WEATHER, PORT, FRESHNESS) -> **data**
(fetches ocean, weather, IMD, boundary and landing data) -> **risk** (deterministic safety rules) ->
**response** (explains the result in the user's language). The pipeline is a fixed sequence, not
free-form tool selection.

---

## The alerts pipeline

1. **Scrape and extract.** IMD fisherman-warning PDFs, sea-area bulletins and cyclone warnings are
   scraped and parsed deterministically (`imd_bulletin_facts.py`). Every fact keeps the **time its
   source issued it** and how long it is valid.
2. **Match to the user.** Facts are matched to the user's state and district (nearest landing
   centre, so it is only reliable near the coast). Expired bulletins are never shown as active.
3. **Newest source wins.** When two facts describe the same place and kind of thing, the later issue
   time wins (`imd_simplifier.py`). Facts with no stated issue time are never overridden by time.
4. **LLM key-facts step, boxed in.** The LLM (Sarvam-105B) only picks which facts matter, which IMD
   advisory to quote, and may write one plain sentence. It never writes numbers, places or times —
   it returns fact IDs and the values are copied from the facts. The sentence is rejected if it
   contains a number not in the facts or any instruction wording; advice is quoted verbatim from
   IMD; code re-applies the newest-wins rule and re-adds any dropped wind/thunderstorm/storm fact;
   if the call fails a rule-based summary is used.
5. **Translation.** Dynamic English text is translated with Sarvam-Translate, cached, and always
   shown with the English original.

Open-Meteo forecasts are deliberately **not** treated as facts in step 3: a model reading is always
"now" and must never override an official IMD warning. The old free-text LLM news rewrite
(`IMD_NEWS_LLM`) is off because it invented advice IMD never gave.

---

## Data sources

| Source | Used for |
|---|---|
| IMD | Fisherman warnings, sea-area bulletins, cyclone warnings (wind, gusts, thunderstorm, storm) |
| INCOIS | Potential Fishing Zones; swell-surge / high-wave alerts (published inside IMD bulletins) |
| Copernicus Marine Service | Sea-surface temperature and chlorophyll grid (~30,400 points). If Copernicus is unavailable, the grid falls back to Open-Meteo SST and a chlorophyll baseline calibrated to INCOIS PFZ zones, and the app says the values are estimates. |
| Open-Meteo | Weather and marine forecasts (wind, waves, rain, visibility, sea level / tide) |
| Static GIS (`data/static/`) | India EEZ (2), international boundaries (17), landing centres (1,223), PFZ polygons (52) |
| Google Maps | Map display |

---

## Languages and translation

- **Fixed UI text** is bundled in the app: `mobile/src/constants/translations/*.ts`, one file per
  screen, 10 languages, English fallback. No library or API, so it works offline.
- **Dynamic backend text** (IMD messages, coastal news, alert summaries) is translated on request by
  `backend/src/services/translation_service.py` via Sarvam-Translate, cached, with timeouts and a
  cooldown when the API is down.
- Safety wording in the non-English languages should be reviewed by native speakers before release.

---

## Tech stack

- **Mobile:** React Native, Expo (EAS Build), TypeScript, React Navigation (bottom tabs), Zustand,
  Axios, react-native-maps / Google Maps SDK, expo-location, expo-audio, AsyncStorage + SQLite.
- **Backend:** Python 3.12, FastAPI, Uvicorn, LangGraph / LangChain, Pydantic, GeoPandas, Shapely,
  xarray, pdfplumber, BeautifulSoup, httpx, SQLite.
- **AI:** Sarvam AI — Sarvam-105B (LLM), Saaras v3 (speech-to-text), Bulbul v3 (text-to-speech),
  Sarvam-Translate.
- **Deployment:** Docker + Docker Compose, Caddy (Let's Encrypt HTTPS), AWS Lightsail (Mumbai),
  Expo EAS for APK builds, GitHub.

---

## Repository structure

```
SeaSarathi/
├── backend/
│   ├── main.py                # FastAPI app, lifespan (background refresh), API-key gate
│   ├── requirements.txt
│   ├── src/
│   │   ├── agents/            # planner, data, risk, response, LangGraph state graph
│   │   ├── routers/           # one file per feature area (chat, alerts, pfz, news, ...)
│   │   ├── services/          # IMD scrapers/parsers, imd_alerts, imd_simplifier,
│   │   │                      #   translation_service, Copernicus, Open-Meteo, Sarvam client
│   │   ├── utils/             # geofence, geo maths, GeoJSON store, data freshness
│   │   └── db/                # SQLite profile store
│   ├── scripts/               # fetch_copernicus_grid.py (pre-compute the ocean grid)
│   ├── tests/                 # unit tests (unittest)
│   └── .env                   # secrets (gitignored) — copy from .env.example
├── mobile/
│   ├── src/{screens,components,navigation,services,store,constants/translations,utils,theme}
│   ├── app.config.js, eas.json
│   └── .env                   # gitignored — copy from .env.example
├── data/
│   ├── static/                # GeoJSON: EEZ, boundaries, landing centres, PFZ
│   └── dynamic/               # generated ocean grid (gitignored)
├── deploy/                    # Dockerfile, docker-compose.yml, Caddyfile, AWS.md
├── PRD.md  DESIGN.md  EXECUTION.md  CLAUDE.md
├── ANDROID_BUILD.md  ANDROID_AUDIT.md  COPERNICUS_DATA_ACCESS.md  IMD_IMPLEMENTATION_PLAN.md  UPDATE.md
└── README.md
```

---

## Quickstart (local development)

**Prerequisites:** Python 3.12, Node 20+, the Expo Go app or an Android emulator.

### 1. Backend

```bash
cd backend
python -m venv venv
# Windows PowerShell:  .\venv\Scripts\Activate.ps1      Linux/macOS:  source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then fill in your keys (below)
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Minimum `.env` values: `SARVAM_API_KEY`, and `COPERNICUS_USERNAME` / `COPERNICUS_PASSWORD` for real
satellite data (see `.env.example` for the rest). `--host 0.0.0.0` is needed so a phone or emulator can
reach the server.

- Health: `http://localhost:8000/health`; data readiness: `/health/ready` (the ocean grid takes about
  90 seconds to download on a cold start). API docs: `/docs`.
- To pre-compute the ocean grid instead of waiting, run it from the repository root:
  `python backend/scripts/fetch_copernicus_grid.py`.
- Optional `API_KEY` in `.env` turns on the shared-secret check (used for public deployments). Leave
  it unset locally.

### 2. Mobile app

```bash
cd mobile
npm install
npm start          # Expo dev server; scan the QR code with Expo Go, or press `a` for Android
```

In development the app auto-detects your laptop from the Metro host, so `EXPO_PUBLIC_API_URL` can stay
unset (see `mobile/.env.example`). `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is needed for the Map screen.

### 3. Tests

```bash
cd backend
python -m unittest tests.test_imd_simplifier tests.test_translation_service
cd ../mobile && npm run typecheck
```

---

## Deployment

The backend runs on one always-on server so the Copernicus and IMD refresh loops keep running even
when nobody uses the app. Full step-by-step guide (AWS Lightsail + Docker Compose + Caddy HTTPS):
**[deploy/AWS.md](deploy/AWS.md)**.

- **API key:** set `API_KEY` on the server; the app sends the same value as `EXPO_PUBLIC_API_KEY`.
  Every route except `/health*` requires it. The key ships inside the APK, so it deters casual abuse
  rather than acting as real authentication.
- **App builds:** the backend address is fixed into the app at build time. Set
  `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_API_KEY` in the EAS environment
  (`npx eas-cli env:create --environment preview ...`), then `npm run build:apk` from `mobile/`.
  See [ANDROID_BUILD.md](ANDROID_BUILD.md).
- **Update the server:** `git pull && cd deploy && docker compose up -d --build`.

---

## Development commands

| Command | Directory | Purpose |
|---|---|---|
| `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000` | `backend/` | Run the API locally |
| `python -m unittest tests.test_imd_simplifier tests.test_translation_service` | `backend/` | Backend tests |
| `npm start` | `mobile/` | Expo dev server |
| `npm run android` | `mobile/` | Run on an Android device/emulator |
| `npm run typecheck` | `mobile/` | TypeScript check |
| `npm run build:apk` | `mobile/` | EAS cloud APK build (preview profile) |
| `docker compose up -d --build` | `deploy/` | Run the backend stack on a server |

---

## Roadmap (not built yet)

These are **planned, not implemented**:

- Marine protected areas and other sensitive-zone geofencing (today: EEZ and international
  boundaries only).
- Safest-route / fuel-efficient route optimization.
- Explaining productivity trends (why a region's catch is changing) from SST and chlorophyll history.
- Charts and trend visualisations.
- WhatsApp or IVR channel for basic phones and poor coverage.
- Real per-device authentication and a scalable database for growth beyond a pilot.

## Known limitations

- Location matching uses the nearest landing centre, not surveyed district boundaries; reliable only
  near the coast.
- IMD data is scraped from PDFs and web pages with no service guarantee; formats can change.
- Chlorophyll and SST at a zone are grid estimates, and PFZs show where fish are *likely*, not certain.
- Chat and voice need internet; only the last downloaded forecast and map data work offline.
- The agent pipeline is a fixed sequence rather than fully autonomous tool selection.

---

## Documentation index

- [PRD.md](PRD.md) — product requirements · [DESIGN.md](DESIGN.md) — screens, styles, colours ·
  [EXECUTION.md](EXECUTION.md) — original execution plan
- [deploy/AWS.md](deploy/AWS.md) — cloud deployment · [ANDROID_BUILD.md](ANDROID_BUILD.md) — APK builds
- [COPERNICUS_DATA_ACCESS.md](COPERNICUS_DATA_ACCESS.md) — ocean data access ·
  [IMD_IMPLEMENTATION_PLAN.md](IMD_IMPLEMENTATION_PLAN.md) — IMD scraping strategy

---

## Team

- **MNV** — backend, LangGraph agents, Sarvam integration, data ingestion, deployment.
- **ARP** — mobile UI/UX (React Native + Expo), map and layers, API integration.

## Acknowledgments

Built for marine safety and fisherman empowerment in India. Data: [Copernicus Marine
Service](https://marine.copernicus.eu/), [Open-Meteo](https://open-meteo.com/),
[IMD](https://mausam.imd.gov.in/), [INCOIS](https://incois.gov.in/). AI: [Sarvam AI](https://www.sarvam.ai/).
