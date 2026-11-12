import { loadEnvFile } from 'node:process';
import { openDatabase } from '../lib/db.js';
import { migrate } from '../lib/migrations.js';
try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const db = openDatabase();
try {
  console.log('Migraciones aplicadas:', await migrate(db));
} finally {
  await db.end();
}
