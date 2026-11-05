import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function openDatabase(filename = process.env.DATABASE_PATH || './data/dentalcare.sqlite') {
  const resolved = path.resolve(/* turbopackIgnore: true */ filename);
  const publicDir = path.resolve('public');
  if (resolved === publicDir || resolved.startsWith(publicDir + path.sep)) throw new Error('La base debe estar fuera de public.');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const migrations = path.join(process.cwd(), 'migrations');
  for (const file of fs.readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
    db.transaction(() => {
      if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(file)) {
        db.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
        db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(file);
      }
    }).immediate();
  }
  return db;
}
