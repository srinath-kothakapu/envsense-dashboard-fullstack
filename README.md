# EnvSense Full Stack

EnvSense Full Stack is a local, end-to-end environmental telemetry application. It collects readings from sensor nodes (or a built-in simulator), validates and stores them in PostgreSQL through a Node.js/TypeScript REST API, and presents the history in a React/TypeScript dashboard.

Unlike the standalone [`envsense-dashboard`](https://github.com/srinath-kothakapu/envsense-dashboard), this version demonstrates the complete data path: a simulated fleet produces readings, an API accepts and persists them, the dashboard polls for updates, and PostgreSQL supplies device lists, time-series data, and hourly summaries. Docker Compose starts the full stack so it can be explored without physical sensors.

## At a glance

| Layer | Technology | Responsibility |
|---|---|---|
| Web UI | React, TypeScript, Vite, Recharts | Live and historical charts, status cards, thresholds, alerts, CSV tools |
| Web server | nginx | Serves the compiled frontend and proxies `/api` requests |
| API | Node.js 22+, Express 5, TypeScript | Validates, stores, and queries sensor readings |
| Database | PostgreSQL 16 | Persists timestamped readings and supports time-window queries |
| Data producer | Node.js/TypeScript simulator | Sends one-second readings for three virtual nodes |
| Local orchestration | Docker Compose | Starts and health-checks the four services |

## Architecture

```text
Virtual sensors or real-device adapter
                  │  POST /api/readings
                  ▼
       Express + TypeScript API ─────► PostgreSQL
                  ▲                      │
                  │ GET /api/*            │ stored readings / aggregates
             nginx reverse proxy         │
                  ▲                      │
                  └──── React dashboard ◄┘
```

Compose defines four services: `db`, `api`, `simulator`, and `web`. The database health check gates API startup; the simulator waits for the API health check; and the web container serves the static application through nginx. In the complete stack, the browser uses the same-site `/api` path that nginx proxies to the API.

## Features

- **Persistent multi-device telemetry.** Readings include a device name, timestamp, and one or more of temperature, humidity, pressure, and CO2. PostgreSQL stores the data in a timestamped readings table with device/time indexes.
- **A data simulator.** The background producer sends readings for three virtual sensor nodes at a configurable interval. It is a stand-in for hardware, not a real measurement source.
- **Incremental dashboard updates.** The UI polls the API periodically using a timestamp cursor and appends new readings to the visible series.
- **Charts and summaries.** Per-device time series and metric cards make current values and recent ranges easy to compare.
- **Threshold alerts.** The browser emits a single alert when a metric enters a breach, and rearms that alert when readings recover. The threshold configuration is UI state; alert records are not persisted by the API.
- **CSV workflow.** The dashboard can import and export readings in CSV form. It can also be run in browser-simulator mode without the API.
- **Query API.** Readings can be filtered by device and time range; the service also exposes device summaries and hourly aggregates computed in SQL.
- **Automated checks.** Frontend and API unit/HTTP tests are supplemented by PostgreSQL integration tests and a Compose smoke test in GitHub Actions.

## Run the full application

### Requirements

- Docker and Docker Compose v2
- A free local port 8080 for the dashboard and 3001 for the API

### Start

From the repository root:

```bash
git clone https://github.com/srinath-kothakapu/envsense-dashboard-fullstack.git
cd envsense-dashboard-fullstack
docker compose up --build
```

Open the dashboard at [http://localhost:8080](http://localhost:8080). Check the API at [http://localhost:3001/api/health](http://localhost:3001/api/health). The Compose stack starts PostgreSQL, the API, the simulator, and the nginx-served dashboard; the simulator begins posting readings once the API is healthy.

Stop the services and keep the database volume:

```bash
docker compose down
```

To also delete the locally persisted database data:

```bash
docker compose down -v
```

The `-v` option is destructive to the named Compose database volume. Use it only when you intend to discard the stored readings.

### Local frontend development

The React application can run separately using its in-browser simulator, without Docker or a database:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). To use the API instead, the API and a PostgreSQL instance must be available; see the service configuration in [`docker-compose.yml`](docker-compose.yml), the API package scripts, and [`docs/DESIGN.md`](docs/DESIGN.md). The Compose example is the simplest way to supply the required services together.

## API reference

The API listens on port `3001` in the Compose configuration. JSON request bodies are limited to 1 MB. Readings are validated before storage; a batch is accepted as a whole or rejected as a whole.

### `POST /api/readings`

Submit one reading or an array of up to 1,000 readings. Every reading has a `device` and may include a `timestamp` (ISO date/time or epoch milliseconds) and one or more measurement fields. When omitted, the timestamp is set to the current time. Invalid rows are rejected rather than partially inserted.

```bash
curl -X POST http://localhost:3001/api/readings \
  -H "Content-Type: application/json" \
  -d '{"device":"my-sensor","temperature":23.4,"humidity":41,"co2":612}'
```

A successful request returns HTTP `201` with the number of inserted readings:

```json
{"inserted":1}
```

### `GET /api/readings`

Return readings in chronological order. Optional parameters:

| Parameter | Meaning |
|---|---|
| `from` | Inclusive start time; ISO date/time or epoch milliseconds |
| `to` | End of requested time range; ISO date/time or epoch milliseconds |
| `device` | Restrict results to a device name |
| `limit` | Maximum rows, from 1 to 10,000; defaults to 1,000 |

Example: `GET /api/readings?device=node-01&from=2026-03-20T10:00:00Z&limit=100`

### `GET /api/devices`

List known devices with their reading counts and most recent reading time.

### `GET /api/stats/hourly`

Return per-device, per-metric hourly averages and ranges over a recent period. `hours` defaults to 24 and is limited to 90 days; `device` is optional.

### `GET /api/health`

Returns HTTP `200` with `{"status":"ok"}` when the database responds, and HTTP `503` when it does not.

## Data model and operational behavior

The database stores each reading as a timestamp plus a device and the available metric values. PostgreSQL constraints ensure a row contains at least one measurement; the API applies its own validation before attempting a write. A batch uses one parameterized bulk insert, so it is handled in one database round trip.

The dashboard polls approximately once per second and resumes from a timestamp cursor. This is intentionally simple for a small demo stack. There can be up to a poll interval of display latency; a late-arriving reading whose timestamp is older than the last cursor can be missed by incremental polling. For higher-volume or delayed data, a monotonic ingestion ID or a streaming mechanism would be a more suitable cursor.

Alerts are evaluated in the browser because the thresholds are part of the current UI session. They are not written to PostgreSQL, delivered when the dashboard is closed, or sent to external notification services.

## Tests and CI

The frontend and API are separate Node projects. Node.js **22 or newer** is required for the API.

```bash
# Frontend (repository root)
npm ci
npm run typecheck
npm test
npm run build

# API
cd api
npm ci
npm run typecheck
npm test
npm run build
```

The API tests include HTTP tests with an in-memory store. PostgreSQL integration tests need a real test database configured through `TEST_DATABASE_URL`; GitHub Actions runs those tests against a PostgreSQL service container. The CI workflow also builds the Docker images, starts the Compose stack, and checks that the application responds through nginx.

## Repository structure

```text
src/                     React + TypeScript dashboard
  hooks/                 Telemetry source, polling, alert and rolling-window state
  components/            Cards, charts, alert panel and threshold controls
  lib/                   CSV, metrics, series, simulator and API client
api/
  src/app.ts              Express routes and HTTP validation
  src/validate.ts         Reading and query validation
  src/pgStore.ts          PostgreSQL-backed store
  src/memoryStore.ts      Lightweight store for HTTP tests
  src/simulate.ts         Virtual sensor producer
  sql/schema.sql          Table, constraints and indexes
  src/*.test.ts           API and data-store tests
docs/DESIGN.md            Architecture decisions, trade-offs and limits
docker-compose.yml        Database, API, simulator and web services
Dockerfile, nginx.conf    Web image and reverse-proxy configuration
sample-data/              CSV example for import
```

## Security and deployment limitations

This repository is intended for local development and demonstration, not as a ready-to-deploy public sensor service.

- The API has **no authentication, authorization, or rate limiting**. Anyone who can reach it can submit and query readings.
- CORS is deliberately permissive for development. Restrict allowed origins before exposing an API outside a trusted local environment.
- Compose uses a simple fallback database password for local convenience. Set `POSTGRES_PASSWORD` to a strong secret in any shared environment and never commit real credentials.
- The API and simulator use local HTTP in the Compose network; TLS, device identity, and per-device authorization are not configured.
- There is no data-retention policy, backup strategy, production secrets manager, or high-availability setup.
- Browser-side alerts are not persistent operational notifications.

Do not put sensitive sensor data into an internet-accessible deployment without adding appropriate access controls, secure transport, retention, and monitoring.

## Further documentation

[`docs/DESIGN.md`](docs/DESIGN.md) records important implementation choices, including polling versus WebSockets, browser-side alerts, PostgreSQL indexing, bulk insertion, timestamp handling, and current trade-offs.

