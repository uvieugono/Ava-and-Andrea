import { Pool } from 'pg';
import { DatabaseShape, createBoundStore, emptyDb } from './store.ts';
import type { Notifiers } from './workflow.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_state (
  id integer PRIMARY KEY,
  doc jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export async function openPostgresStore(connectionString: string, now: () => Date = () => new Date(), notifiers: Notifiers = {}) {
  const pool = new Pool({ connectionString, max: 5 });
  await pool.query(SCHEMA);
  const found = await pool.query('SELECT doc FROM app_state WHERE id = 1');
  const saved = found.rows[0]?.doc as Partial<DatabaseShape> | undefined;
  const db = { ...emptyDb(), ...(saved ?? {}) };
  return createBoundStore(db, async (snapshot) => {
    await pool.query(
      `INSERT INTO app_state (id, doc, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
      [JSON.stringify(snapshot)],
    );
  }, now, notifiers);
}
