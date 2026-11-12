import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../lib/db.js';
import { hashPassword, login, logout, sessionUser, digest } from '../lib/security.js';

test('PostgreSQL: autenticación, bloqueo, expiración y cierre de sesión', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = openDatabase();
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Las tablas temporales aíslan la prueba de los registros del proyecto.
    await client.query(`
      CREATE TEMP TABLE users (
        id INTEGER PRIMARY KEY, name TEXT, email TEXT,
        password_hash TEXT, role TEXT, dentist_id INTEGER
      ) ON COMMIT DROP;
      CREATE TEMP TABLE sessions (
        token_hash TEXT PRIMARY KEY, user_id INTEGER, expires_at BIGINT
      ) ON COMMIT DROP;
      CREATE TEMP TABLE login_attempts (
        key TEXT PRIMARY KEY, attempts INTEGER, reset_at BIGINT
      ) ON COMMIT DROP;
    `);
    const password = 'Postgres-test-12345';
    const email = 'auth-test@example.invalid';
    await client.query(
      'INSERT INTO users VALUES (1,$1,$2,$3,$4,NULL)',
      ['Recepción de prueba', email, hashPassword(password), 'recepcionista']
    );

    await assert.rejects(login(client, email, 'incorrecta'), { status: 401 });
    const token = await login(client, email.toUpperCase(), password);
    assert.equal((await sessionUser(client, token)).id, 1);
    const stored = await client.query('SELECT token_hash FROM sessions');
    assert.equal(stored.rows[0].token_hash, digest(token));
    assert.notEqual(stored.rows[0].token_hash, token);
    assert.equal((await client.query('SELECT * FROM login_attempts')).rowCount, 0);
    assert.equal(await sessionUser(client, undefined), null);
    assert.equal(await sessionUser(client, 'token-invalido'), null);

    await logout(client, token);
    assert.equal(await sessionUser(client, token), null);
    const expired = await login(client, email, password);
    await client.query('UPDATE sessions SET expires_at=0');
    assert.equal(await sessionUser(client, expired), null);

    for (let attempt = 0; attempt < 10; attempt++) {
      await assert.rejects(login(client, email, 'incorrecta'), { status: 401 });
    }
    await assert.rejects(login(client, email, password), { status: 429 });
    await client.query('UPDATE login_attempts SET reset_at=0');
    await assert.rejects(login(client, email, 'incorrecta'), { status: 401 });
    const reset = await client.query('SELECT attempts FROM login_attempts');
    assert.equal(reset.rows[0].attempts, 1);
    assert.ok(await login(client, email, password));
  } finally {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    }
    await pool.end();
  }
});
