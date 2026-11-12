import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) throw new Error('La contraseña debe tener entre 10 y 256 caracteres.');
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [, salt, hash] = encoded.split('$');
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), actual);
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const dummyHash = hashPassword('dummy-password-unusable');
export async function login(db, email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const key = digest(normalizedEmail);
  const now = Date.now();
  const attemptResult = await db.query('SELECT * FROM login_attempts WHERE key = $1', [key]);
  const attempt = attemptResult.rows[0];
  if (attempt && Number(attempt.reset_at) > now && attempt.attempts >= 10) throw new AppError('Demasiados intentos. Espera 15 minutos.', 429);
  const userResult = await db.query('SELECT * FROM users WHERE lower(email) = $1', [normalizedEmail]);
  const user = userResult.rows[0];
  const valid = verifyPassword(password, user?.password_hash || dummyHash);
  if (!user || !valid) {
    await db.query(`INSERT INTO login_attempts(key,attempts,reset_at) VALUES ($1,1,$2)
      ON CONFLICT(key) DO UPDATE SET
        attempts=CASE WHEN login_attempts.reset_at < $3 THEN 1 ELSE login_attempts.attempts+1 END,
        reset_at=CASE WHEN login_attempts.reset_at < $3 THEN excluded.reset_at ELSE login_attempts.reset_at END`,
    [key, now + 900000, now]);
    throw new AppError('Correo o contraseña incorrectos.', 401);
  }
  await db.query('DELETE FROM login_attempts WHERE key = $1', [key]);
  const token = randomBytes(32).toString('hex');
  await db.query('DELETE FROM sessions WHERE expires_at <= $1', [now]);
  await db.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [digest(token), user.id, now + 8 * 3600000]);
  return token;
}
export async function sessionUser(db, token) {
  if (!token) return null;
  const result = await db.query(`SELECT u.id,u.name,u.email,u.role,u.dentist_id FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>$2`, [digest(token), Date.now()]);
  return result.rows[0] || null;
}
export async function logout(db, token) {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]);
}
export function checkOrigin(request) {
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get('origin') !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AppError('Solicitud de otro sitio rechazada. Revisa APP_ORIGIN.', 403);
  }
}
