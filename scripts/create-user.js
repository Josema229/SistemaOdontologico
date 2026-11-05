import { loadEnvFile } from 'node:process';
import { openDatabase } from '../lib/db.js';
import { createUser } from '../lib/services.js';
try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const position = arg.indexOf('=');
  return [arg.slice(0, position).replace(/^--/, ''), arg.slice(position + 1)];
}));
const db = openDatabase();
try {
  // El secreto se proporciona por entorno para no almacenarlo en el historial de comandos.
  const userId = createUser(db, { ...args, dentist_id: args.dentist, password: process.env.DENTALCARE_USER_PASSWORD });
  console.log(`Usuario creado: #${userId} (${args.role}).`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { db.close(); }
