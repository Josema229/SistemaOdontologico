import { loadEnvFile } from 'node:process';
import { openDatabase } from '../lib/db.js';
try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const db = openDatabase();
console.log('Migraciones aplicadas:', db.prepare('SELECT version FROM schema_migrations').all());
db.close();
