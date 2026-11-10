# EnvSense

[![CI](https://github.com/srinath-kothakapu/envsense-dashboard-fullstack/actions/workflows/ci.yml/badge.svg)](https://github.com/srinath-kothakapu/envsense-dashboard-fullstack/actions/workflows/ci.yml)

EnvSense is a full-stack **environmental sensor monitoring** system for collecting and exploring readings from multiple devices. Sensors or a simulator send temperature, humidity, pressure and CO₂ readings to a **Node.js + TypeScript API**; a **PostgreSQL** database stores the readings, and a **React + TypeScript** dashboard presents them as live, multi-device charts and statistics.

The dashboard can run on its own with an in-browser simulator, or poll the API for persisted readings. Users can inspect threshold status, adjust limits, review edge-triggered alerts, and import or export readings as CSV. The API validates incoming data and supports device and time-range queries as well as hourly aggregates. **Docker Compose** starts the database, API, simulator and nginx-served dashboard together, making it straightforward to run the complete stack locally.

```
sensors / simulator ──▶ API (Express, TS) ──▶ PostgreSQL
                          ▲
browser ──▶ nginx (React app) ── /api ──┘
```

## Run it

### Everything in Docker (recommended)
```bash
docker compose up --build
# dashboard: http://localhost:8080      API: http://localhost:3001/api/health
```
This starts Postgres, the API, a sensor simulator (3 virtual nodes, 1 reading/s each) and the nginx-served dashboard. Optionally copy `.env.example` to `.env` to set the database password. Stop with `docker compose down` (add `-v` to also delete stored data).

### Local development
```bash
# 1) frontend only, using the in-browser simulator (no backend needed)
npm install
npm run dev                      # http://localhost:5173

# 2) frontend + real API
docker compose up -d db          # just Postgres  (or use any Postgres you have)
cd api && npm install
DATABASE_URL=postgres://envsense:envsense@localhost:5432/envsense npm run dev   # API on :3001
npm run simulate                 # in a 2nd terminal: fake sensor data -> API
cd .. && VITE_USE_API=true npm run dev   # dashboard proxies /api to :3001
```
Note: in compose the database port is not published; add `ports: ["5432:5432"]` to the `db` service for option 2.

## Features
- **Live multi-device charts** with min/max threshold lines (Recharts)
- **Stat cards**: latest value, window min/avg/max, in-range / too high / too low
- **Edge-triggered alerts** (one alert when a metric enters a breach, not one per sample) with **editable thresholds**
- **CSV import / export** (see `sample-data/sample-readings.csv`)
- **REST API** with input validation, bulk insert, time-range queries and hourly SQL aggregates
- **Resilient UI**: shows "cannot reach API" and recovers automatically

## API

| Method & path | Description |
| --- | --- |
| `POST /api/readings` | One reading or an array (max 1000). Body: `{ device, timestamp?, temperature?, humidity?, pressure?, co2? }`. `timestamp` = epoch ms or ISO string (default: now). At least one metric required. All-or-nothing. → `201 {inserted}` |
| `GET /api/readings?from=&to=&device=&limit=` | Readings oldest-first. `from`/`to` = epoch ms or ISO. `limit` 1–10000 (default 1000) |
| `GET /api/devices` | Devices with reading count and last-seen time |
| `GET /api/stats/hourly?hours=24&device=` | Hourly avg/min/max per device and metric, computed in SQL |
| `GET /api/health` | `200` if the database answers, else `503` |

```bash
curl -X POST localhost:3001/api/readings -H 'Content-Type: application/json' \
  -d '{"device":"my-stm32","temperature":23.4,"humidity":41,"co2":612}'
```

Schema: [`api/sql/schema.sql`](api/sql/schema.sql) (applied automatically on API start).

## Tests and CI
```bash
npm test                 # frontend: unit + component + hook tests (Vitest, Testing Library)
npm run typecheck
cd api && npm test       # API: HTTP tests; add TEST_DATABASE_URL to also run the Postgres integration tests
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/envsense_test npm test
```
GitHub Actions (`.github/workflows/ci.yml`) runs three jobs: **web** (typecheck, tests, build), **api** (typecheck, tests against a Postgres service container, build) and **docker** (builds the images, starts the compose stack, smoke-tests it through the nginx proxy).

## Project structure
```
src/                 React + TypeScript dashboard
  lib/               pure logic: alerts, csv, series, simulator, api client (unit-tested)
  hooks/             useTelemetry: simulator or API polling, rolling window, alerts
  components/        StatCard, TelemetryChart, AlertsPanel, ThresholdEditor
api/                 Node + Express + TypeScript service
  src/               app (routes), validate, pgStore, memoryStore, server, simulate
  sql/schema.sql     table + indexes + constraints
docs/DESIGN.md       architecture decisions, trade-offs and limitations
Dockerfile, nginx.conf, docker-compose.yml, .github/workflows/ci.yml
```

## Connecting real hardware
Any device that can send HTTP can `POST /api/readings` (an ESP32 directly; an STM32 via a gateway such as a Raspberry Pi or an ESP-AT module). Replace the `simulator` service with your gateway.

## Tech stack
React 19 · TypeScript · Vite · Recharts · Node.js 22 · Express 5 · PostgreSQL 16 · Docker / Compose · nginx · Vitest · GitHub Actions

See [`docs/DESIGN.md`](docs/DESIGN.md) for design decisions and trade-offs. Licensed under MIT.
