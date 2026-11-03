import { Pool } from 'pg';
import { DatabaseShape, StoreOptions, createBoundStore, emptyDb } from './store.ts';
import type { Notifiers } from './workflow.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_state (
  id integer PRIMARY KEY,
  doc jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

/**
 * Runs writes one at a time, in the order they were asked for. The whole app state is
 * one row, so an older save finishing after a newer one would quietly undo the newer one.
 */
export function inOrder<T>(write: (doc: string) => Promise<T>) {
  let last: Promise<unknown> = Promise.resolve();
  return (doc: string) => {
    const run = last.then(() => write(doc));
    last = run.catch(() => undefined);
    return run;
  };
}

export async function openPostgresStore(connectionString: string, now: () => Date = () => new Date(), notifiers: Notifiers = {}, options: StoreOptions = {}) {
  const pool = new Pool({ connectionString, max: 5 });
  // An idle connection dropped by the database must not stop the server.
  pool.on('error', (error) => console.error('Database connection lost', error.message));
  await pool.query(SCHEMA);
  const found = await pool.query('SELECT doc FROM app_state WHERE id = 1');
  const saved = found.rows[0]?.doc as Partial<DatabaseShape> | undefined;
  const db = { ...emptyDb(), ...(saved ?? {}) };
  const write = inOrder((doc) => pool.query(
    `INSERT INTO app_state (id, doc, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    [doc],
  ));
  return createBoundStore(db, async (snapshot) => {
    await write(JSON.stringify(snapshot));
  }, now, notifiers, options);
}
