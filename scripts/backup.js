import { loadEnvFile } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, transaction } from '../lib/db.js';
import { dataTables } from '../lib/data-tables.js';

try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const target = path.resolve(process.argv[2] || `./backups/dentalcare-${Date.now()}.json`);
const publicDir = path.resolve('public');
if (target === publicDir || target.startsWith(publicDir + path.sep)) throw new Error('El respaldo debe estar fuera de public.');
if (fs.existsSync(target)) throw new Error('El archivo de respaldo ya existe. Usa otro nombre.');
fs.mkdirSync(path.dirname(target), { recursive: true });
const db = openDatabase();
try {
  const tables = await transaction(db, async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = {};
    for (const table of [...dataTables, 'schema_migrations']) {
      snapshot[table] = (await client.query(`SELECT * FROM "${table}"`)).rows;
    }
    return snapshot;
  });
  fs.writeFileSync(target, JSON.stringify({ format: 'dentalcare-postgres-v1', created_at: new Date().toISOString(), tables }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log('Respaldo PostgreSQL consistente creado:', target);
} finally {
  await db.end();
}