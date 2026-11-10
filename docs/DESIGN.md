# Design notes

Short record of the main decisions, the trade-offs behind them and known limitations.

## Architecture

```
 sensor nodes / simulator ──POST /api/readings──▶  API (Node + Express, TS) ──▶ PostgreSQL
                                                        ▲
 browser ──▶ nginx (static React app) ──/api/*──────────┘   (dashboard polls GET /api/readings)
```

Four containers: `db`, `api`, `simulator` (stand-in for hardware), `web` (nginx serving the React build and reverse-proxying `/api`).

## Decisions

### 1. Polling with a timestamp cursor, not WebSockets
The dashboard asks for `GET /api/readings?from=<last timestamp + 1>` once per second and appends the result.
- **Why:** stateless, trivial to proxy and cache, easy to test, no connection management. At 3 devices × 1 Hz the load is negligible.
- **Trade-off:** up to 1 s latency, and a cursor on `timestamp` can miss a reading that arrives *late* with an older timestamp than one already seen.
- **If this grows:** use a monotonically increasing `id` as the cursor, or Server-Sent Events / WebSockets with Postgres `LISTEN/NOTIFY`.

### 2. Edge-triggered alerts
An alert fires when a metric *enters* a breach and re-arms after recovery, not on every sample. Otherwise a sensor stuck at 40 °C would produce 3,600 alerts per hour. Implemented as a pure function (`detectAlerts`) with an `active` set, so the same code serves live streaming, API polling and CSV import, and is unit-tested.

### 3. Alerts are evaluated in the browser
Thresholds are per-user UI state, so evaluation happens client-side. **Trade-off:** alerts are not persisted and nobody is notified while no browser is open. A production system would evaluate rules server-side and send notifications (e-mail, Slack).

### 4. PostgreSQL with a plain `readings` table
One wide table (`ts, device, temperature, humidity, pressure, co2`) instead of a row per metric.
- **Why:** the metric set is fixed and small, queries stay simple, and aggregates need no pivot.
- **Indexes:** `(device, ts DESC)` for per-device range scans, `(ts DESC)` for time-window scans across devices.
- **Constraints:** `CHECK` that a row carries at least one metric; device name length. The API validates too, but the database is the last line of defence.
- **Trade-off:** adding a new metric needs a migration. At much larger volume, partition by time or use TimescaleDB/ClickHouse.

### 5. Bulk insert via `unnest`
A batch of readings is one `INSERT … SELECT FROM unnest(arrays)` statement: one round trip, atomic, and fully parameterised (no string-built SQL, no injection surface).

### 6. Validation at the edge, all-or-nothing batches
Bad types and physically implausible values (e.g. humidity 150 %) are rejected with a 400 that names the offending reading. A batch is rejected as a whole so a client never has to work out which half was stored.

### 7. Timestamps
Stored as `TIMESTAMPTZ`; exchanged as epoch milliseconds (what JS uses). Range filters use a half-millisecond tolerance so floating-point rounding in `to_timestamp()` can never drop a row on the boundary. This is covered by an integration test.

### 8. Testing strategy
- Pure logic (alerts, CSV, series, validation): unit tests.
- HTTP layer: `supertest` with an in-memory store, which is fast and covers validation and status codes.
- SQL: integration tests against a **real** Postgres (service container in CI) because SQL semantics can't be mocked meaningfully.
- Polling hook: tested with a mocked `fetch` (incremental cursor, error and recovery, pause).
- CI also builds the images, starts the whole compose stack and smoke-tests it through the nginx proxy.

## Known limitations / next steps
- No authentication or rate limiting on the API (fine for a local demo, not for the internet).
- No data retention policy; a cron job or partition drop would be needed for long-running deployments.
- CORS is wide open (`*`) for development convenience.
- The simulator is the only producer; real devices would authenticate with per-device API keys.
- Possible AI feature: natural-language summaries of alert history, with an evaluation set to check the summaries.
