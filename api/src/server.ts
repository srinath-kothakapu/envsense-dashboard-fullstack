import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { createApp } from './app.js';
import { PgStore } from './pgStore.js';

const PORT = Number(process.env.PORT ?? 3001);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required, e.g. postgres://user:pass@localhost:5432/envsense');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
pool.on('error', (err) => console.error('idle pg client error', err.message));

/** The database container may still be starting: retry for up to ~30 s. */
async function connectWithRetry(attempts = 30): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      console.log(`waiting for database (${i}/${attempts})…`);
      await sleep(1000);
    }
  }
}

async function main() {
  await connectWithRetry();
  const schema = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);

  const server = createApp(new PgStore(pool)).listen(PORT, () => console.log(`EnvSense API listening on :${PORT}`));

  const shutdown = () => {
    console.log('shutting down');
    server.close(() => void pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
