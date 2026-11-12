import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

export function openDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL en el archivo .env.');
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      ca: readFileSync(path.join(process.cwd(), 'certs', 'supabase.crt'), 'utf8'),
      rejectUnauthorized: true,
    },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
}

export async function one(db, sql, parameters = []) {
  const result = await db.query(sql, parameters);
  return result.rows[0];
}

export async function all(db, sql, parameters = []) {
  const result = await db.query(sql, parameters);
  return result.rows;
}

export async function transaction(db, action) {
  // Un cliente recibido pertenece a una transacción del llamador (scripts o pruebas).
  const nested = typeof db.release === 'function';
  const client = nested ? db : await db.connect();
  try {
    await client.query(nested ? 'SAVEPOINT service_operation' : 'BEGIN');
    const result = await action(client);
    await client.query(nested ? 'RELEASE SAVEPOINT service_operation' : 'COMMIT');
    return result;
  } catch (error) {
    await client.query(nested ? 'ROLLBACK TO SAVEPOINT service_operation' : 'ROLLBACK');
    if (nested) await client.query('RELEASE SAVEPOINT service_operation');
    throw error;
  } finally {
    if (!nested) client.release();
  }
}
