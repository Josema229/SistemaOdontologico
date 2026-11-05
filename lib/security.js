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
export function login(db, email, password) {
  const key = digest(String(email || '').trim().toLowerCase());
  const now = Date.now();
  const attempt = db.prepare('SELECT * FROM login_attempts WHERE key=?').get(key);
  if (attempt && attempt.reset_at > now && attempt.attempts >= 10) throw new AppError('Demasiados intentos. Espera 15 minutos.', 429);
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').trim().toLowerCase());
  const valid = verifyPassword(password, user?.password_hash || dummyHash);
  if (!user || !valid) {
    db.prepare(`INSERT INTO login_attempts(key,attempts,reset_at) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at < ? THEN 1 ELSE attempts+1 END,
      reset_at=CASE WHEN reset_at < ? THEN excluded.reset_at ELSE reset_at END`).run(key, now + 900000, now, now);
    throw new AppError('Correo o contraseña incorrectos.', 401);
  }
  db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), user.id, now + 8 * 3600000);
  return token;
}
export function sessionUser(db, token) {
  if (!token) return null;
  return db.prepare(`SELECT u.id,u.name,u.email,u.role,u.dentist_id FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token), Date.now()) || null;
}
export function logout(db, token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token)); }
export function checkOrigin(request) {
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get('origin') !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AppError('Solicitud de otro sitio rechazada. Revisa APP_ORIGIN.', 403);
  }
}
