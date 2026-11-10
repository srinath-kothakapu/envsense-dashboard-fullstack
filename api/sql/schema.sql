-- EnvSense schema. Idempotent: applied automatically by the API on startup.

CREATE TABLE IF NOT EXISTS readings (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ      NOT NULL,
  device      TEXT             NOT NULL CHECK (length(device) BETWEEN 1 AND 64),
  temperature DOUBLE PRECISION,
  humidity    DOUBLE PRECISION,
  pressure    DOUBLE PRECISION,
  co2         DOUBLE PRECISION,
  -- every row must carry at least one measurement
  CONSTRAINT readings_has_metric CHECK (
    temperature IS NOT NULL OR humidity IS NOT NULL OR pressure IS NOT NULL OR co2 IS NOT NULL
  )
);

-- "latest readings for one device" and per-device range scans
CREATE INDEX IF NOT EXISTS readings_device_ts_idx ON readings (device, ts DESC);
-- time-window scans across all devices (dashboard polling, hourly stats)
CREATE INDEX IF NOT EXISTS readings_ts_idx ON readings (ts DESC);
