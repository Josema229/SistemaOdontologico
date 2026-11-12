import fs from 'node:fs/promises';
import { transaction } from './db.js';

export async function migrate(db) {
  const directory = new URL('../migrations-postgres/', import.meta.url);
  const files = (await fs.readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  return transaction(db, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dentalcare-migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await client.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY');
    for (const file of files) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [file]);
      if (existing.rowCount) continue;
      await client.query(await fs.readFile(new URL(file, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
    }
    return (await client.query('SELECT version FROM schema_migrations ORDER BY version')).rows;
  });
}
