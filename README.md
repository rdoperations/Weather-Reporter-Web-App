# Weather Reporter

Offshore and onshore weather dashboard for platform operations (Lan Tay, Rong Doi and other sites). It shows current conditions, a multi-day forecast, wave data for offshore locations, go / caution / no-go windows for platform activities, and exports PDF and CSV reports.

- **Front end:** Next.js (App Router) + React, Tailwind CSS, Leaflet
- **Back end:** a FastAPI function (`api/index.py`) that wraps `weather_logic.py` (data fetching and PDF generation with ReportLab / Matplotlib)
- **Hosting:** Vercel (Next.js app + Python serverless function in one project)

> The original Streamlit version is kept in git history (and in `streamlit_legacy/` on machines that still have it).

## Features

| Area | What it does |
|---|---|
| **Locations** | Saved locations (dropdown), place search (Open-Meteo geocoding + fuzzy match on saved names), click-on-map, manual coordinates |
| **Data sources** | Open-Meteo (14 days, hourly, plus marine), OpenWeatherMap (5 days, 3-hourly, API key required), MET Norway (10 days) |
| **Current conditions** | Temperature, wind (knots), rain, and **wave height** for offshore locations (UV index elsewhere) |
| **Forecast summary** | Min/max temperature and wind, max rain, max wave height (or max UV) |
| **Operational Weather Windows** | Hourly GO / CAUTION / NO-GO strip and next usable window per activity (see below) |
| **Charts** | Temperature & humidity, wind & gust, rain & PoP, cloud cover, dew point, UV, wave height, wave period (hover / touch tooltip) |
| **Forecast table** | Full hourly table with highlighting of extreme values |
| **Exports** | Forecast PDF (English or Vietnamese); historical data as PDF or CSV |

### Operational Weather Windows

Limits come from **OPS-2000-MP-1405 Rev 1.8 – Adverse Weather Policy** and live in [`src/config/operatingLimits.ts`](src/config/operatingLimits.ts). Wind is the 10-minute mean at 10 m, in knots; waves are significant wave height, in metres. "X and higher" means ≥ X.

| Activity | Wind caution → stop (kt) | Gust stop (kt) | Hs caution → stop (m) |
|---|---|---|---|
| Crane operations | 25 → 40 | – | 3.0 → 4.0 |
| Helideck operations | 45 → 60 | 60 | 5.5 → 7.0 |
| Supply vessel operations | 20 → 40 | – | 3.0 → 4.0 |
| Overside work | 25 → 30 | – | 2.5 → 3.5 |
| Working at height (scaffolding, rope access, sampling) | 25 → 30 | – | – |
| General deck / exposed-area access | 30 → 50 | – | – |

Also applied to every activity: a thunderstorm is NO-GO and heavy rain (≥ 7.6 mm/h) raises CAUTION. Hours with no data are never counted as part of a window.

- Each activity has an expandable **Procedure basis** list citing the table and row it comes from. Values the procedure does not give are marked "Good practice:" in the notes.
- **Edit limits** changes values for the current browser only (stored in `localStorage`); **Reset to procedure** restores the file's values. To change the official limits, edit `operatingLimits.ts`.

### Wave height instead of UV

The headline cards show wave height in place of UV index when the location is offshore:

- **Saved locations** use the `marine_forecast` flag in the location file (`true` for Lan Tay and Rong Doi, `false` for the onshore and coastal ones).
- **Searched, map-clicked or manual points** have no flag, so wave height is shown whenever the model has wave data for that point.
- Only Open-Meteo has a marine feed; with OpenWeatherMap or MET Norway the cards fall back to UV.

## Getting started

Requirements: **Node.js 20.9+** and **Python 3.12** (the version this project is developed and tested with).

```bash
# 1. front end
npm install

# 2. back end (a virtual environment is recommended)
pip install -r requirements-dev.txt

# 3. run everything with one command
npm run dev:all        # API on :8000 + app on http://localhost:3000

# ...or in two terminals
npm run dev:api        # python -m uvicorn api.index:app --port 8000
npm run dev
```

> **"Server responded with 500" / "cannot reach the weather API"** in development means the
> Python API (port 8000) is not running: `npm run dev` alone starts only the web app.
> Use `npm run dev:all`, or start `npm run dev:api` in a second terminal.

In development, Next.js proxies `/api/*` to `127.0.0.1:8000` (see `next.config.ts`). In production `vercel.json` routes `/api/*` to the Python function instead.

### Configuration

| Setting | Where | Notes |
|---|---|---|
| `OPENWEATHERMAP_API_KEY` | environment variable of the **Python API process** | Only needed for the OpenWeatherMap source. Locally, set it in the terminal that starts `uvicorn` (PowerShell: `$env:OPENWEATHERMAP_API_KEY="..."`; bash: `export OPENWEATHERMAP_API_KEY=...`) — the API does not read `.env.local`. On Vercel, set it in the project's environment variables. **Never commit keys.** |
| `WEATHER_REPORTER_CONTACT` | environment variable of the **Python API process** | E-mail address or URL put in the `User-Agent` sent to the weather services. MET Norway requires an identifying contact. Defaults to `https://weather-reporter-rdp.vercel.app`; set it to the production URL or a shared operations mailbox. |
| Saved locations | `locations.json` (falls back to `location.json`, `config_LDC.json`, `config.json`) | First file that has a non-empty `locations` object wins |

Location file format:

```json
{
  "default_location": "Rong Doi Platform - Block 11.2",
  "dashboard_locations": ["Rong Doi Platform - Block 11.2"],
  "locations": {
    "Rong Doi Platform - Block 11.2": {
      "pdf_name": "Rong Doi Platform - Block 11.2",
      "coords": [7.7925, 108.2021],
      "marine_forecast": true
    }
  }
}
```

A photo for the PDF cover is picked up automatically from `Pictures/<location name with spaces as underscores>.png` (for example `Pictures/Rong_Doi_Platform_-_Block_11.2.png`).

## API

All routes are under `/api` and return JSON unless noted.

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Liveness check |
| `GET /api/locations` | Saved locations (only `locations`, `default_location`, `dashboard_locations` are exposed) |
| `POST /api/weather` | `{lat, lon, source, location_name}` → `{weather_data, location_info, marine_data}` |
| `POST /api/export/pdf` | Forecast PDF (`language`: `en` or `vi`) – returns `application/pdf` |
| `POST /api/export/pdf_custom` | PDF from supplied hourly data (used for historical reports) |

Errors: `400` unknown data source, `422` invalid coordinates, `502` the upstream weather service failed (the message says why), `500` PDF generation failure.

## Deploying to Vercel

1. Import the repository as a Vercel project (framework preset: Next.js, root directory: the folder containing `package.json`).
2. Add `OPENWEATHERMAP_API_KEY` under *Settings → Environment Variables* if you use that source.
3. Push. `vercel.json` already:
   - bundles `weather_logic.py`, the location files, the Noto Sans fonts and `Pictures/` into the Python function (`includeFiles`),
   - sets `maxDuration` (60 s) and memory (1024 MB) for PDF generation,
   - routes `/api/*` to `api/index.py`.
4. `.vercelignore` keeps report PDFs, caches, `dist/` and the legacy app out of the upload.

Notes:

- The serverless filesystem is read-only, so PDFs are written to the OS temp directory and deleted after the response is sent.
- Python dependencies are kept minimal (`requirements.txt`) because Vercel limits function bundle size; installed they come to roughly 170 MB. Check your plan's `maxDuration` limit if long historical PDFs time out.
- Historical exports are limited to **31 days**, and the archive trails real time by about **5 days**.

### Before going to production

- [ ] Set `WEATHER_REPORTER_CONTACT` to the real production URL or a monitored operations mailbox (the default is a tentative URL). MET Norway's terms require an identifying contact and may block generic agents.
- [ ] Confirm the limits in `operatingLimits.ts` with the Operations Supervisor / OIM.
- [ ] Protect the deployment (Vercel Password Protection / SSO) if it should not be public.
- [ ] Review the free-tier rate limits of Open-Meteo and OpenWeatherMap against expected usage.

## Project structure

```
api/index.py              FastAPI app (routes above)
weather_logic.py          Data fetching, parsing, PDF/Excel report generation
locations.json            Saved locations (+ location.json, config_LDC.json fallbacks)
Pictures/, NotoSans-*.ttf Report cover photos and Vietnamese-capable fonts (used by PDFs)
public/Pictures/Logo.png  Logo shown in the web UI
vercel.json               Function bundling, duration, routing
src/
  app/                    Next.js shell: layout, global styles, page.tsx (composition only)
  components/             LocationPicker, SourceBar, CurrentConditions, ForecastSummary,
                          OperationalWindows, WeatherChart, ForecastTable, ExportPanel, ...
  hooks/useWeather.ts     Data state: locations, selected location, source, forecast
  config/operatingLimits.ts  Activity limits (from OPS-2000-MP-1405)
  lib/                    derive.ts (wave / summary calculations), units.ts (formatting, units)
  types/weather.ts        Shapes returned by the API
```

## Data and units

- Wind is in **knots**, temperature in °C, waves in metres, pressure in hPa.
- Rain is **mm/h** for Open-Meteo and MET Norway and **mm per 3 h** for OpenWeatherMap. The unit shown follows the source the data was fetched from.
- Times are local to the selected location (timezone resolved by the data source).
- These are **model forecasts**, not measurements: platform anemometers sit higher than the 10 m reference, and helideck limits are defined at the helideck. Use live readings for the actual decision.
- Sources: [Open-Meteo](https://open-meteo.com) (forecast, marine, archive, geocoding), [OpenWeatherMap](https://openweathermap.org), [MET Norway](https://api.met.no), and a [Windy](https://www.windy.com) embed for the precipitation map.

## Development

```bash
npm run lint      # ESLint (must stay at 0 problems)
npx tsc --noEmit  # type-check
npm run build     # production build
```

There is no automated test suite yet; changes to rendering are checked manually against Open-Meteo (offshore and onshore locations) and MET Norway (no UV / PoP / wave data).
