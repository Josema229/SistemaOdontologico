import { loadEnvFile } from 'node:process';
import { openDatabase } from '../lib/db.js';
import fs from 'node:fs';
import path from 'node:path';
try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const target = path.resolve(process.argv[2] || `./backups/dentalcare-${Date.now()}.sqlite`);
const publicDir = path.resolve('public');
if (target === publicDir || target.startsWith(publicDir + path.sep)) throw new Error('El respaldo debe estar fuera de public.');
if (fs.existsSync(target)) throw new Error('El archivo de respaldo ya existe. Usa otro nombre.');
fs.mkdirSync(path.dirname(target), { recursive: true });
const db = openDatabase();
try { await db.backup(target); console.log('Respaldo consistente creado:', target); }
finally { db.close(); }
