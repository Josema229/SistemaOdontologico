import { loadEnvFile } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase, transaction } from '../lib/db.js';
import { migrate } from '../lib/migrations.js';
import { dataTables, normalizeRow } from '../lib/data-tables.js';

function sameRecords(left, right) {
  const stable = records => records.map(row => JSON.stringify(Object.entries(normalizeRow(row)).sort())).sort();
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const filename = process.argv[2] || process.env.DATABASE_PATH || './data/dentalcare.sqlite';
const source = new Database(filename, { readonly: true, fileMustExist: true });
const destination = openDatabase();
try {
  if (source.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('La base SQLite tiene errores de integridad.');
  if (source.pragma('foreign_key_check').length) throw new Error('La base SQLite tiene relaciones inválidas.');
  fs.mkdirSync('backups', { recursive: true });
  const backup = path.resolve('backups', `before-supabase-${Date.now()}.sqlite`);
  await source.backup(backup);
  console.log('Respaldo local creado:', backup);
  // Una sola lectura transaccional obtiene una imagen consistente del origen.
  const snapshot = source.transaction(() => Object.fromEntries(dataTables.map(table => [
    table, source.prepare(`SELECT * FROM "${table}"`).all().map(normalizeRow),
  ])))();
  await migrate(destination);
  const report = await transaction(destination, async client => {
    await client.query('SET LOCAL TIME ZONE \'UTC\'');
    await client.query(`LOCK TABLE ${dataTables.map(table => `public."${table}"`).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
    const counts = [];
    for (const table of dataTables) {
      const rows = snapshot[table];
      const existing = (await client.query(`SELECT * FROM public."${table}"`)).rows;
      if (existing.length) {
        // Una segunda ejecución es válida únicamente si los registros coinciden.
        if (!sameRecords(existing, rows)) throw new Error(`La tabla ${table} ya contiene datos diferentes. Importación detenida.`);
      } else {
        for (const row of rows) {
          const columns = Object.keys(row);
          const values = columns.map(column => row[column]);
          const parameters = columns.map((_, index) => `$${index + 1}`).join(',');
          await client.query(`INSERT INTO public."${table}" (${columns.map(column => `"${column}"`).join(',')}) VALUES (${parameters})`, values);
        }
      }
      const imported = (await client.query(`SELECT * FROM public."${table}"`)).rows;
      if (!sameRecords(imported, rows)) throw new Error(`Verificación fallida en ${table}`);
      if (rows.some(row => Object.hasOwn(row, 'id'))) {
        const nextId = Math.max(...rows.map(row => row.id)) + 1;
        await client.query(`ALTER TABLE public."${table}" ALTER COLUMN id RESTART WITH ${nextId}`);
      }
      counts.push({ table, records: rows.length });
    }
    return counts;
  });
  console.table(report);
  console.log('Importación y comparación completas.');
} finally {
  source.close();
  await destination.end();
}
