import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { openDatabase } from '../lib/db.js';
import { login, sessionUser, logout, checkOrigin, digest } from '../lib/security.js';
import * as s from '../lib/services.js';

let db, directory, filename, reception, doctor, other, patient;
const now = { date: '2030-01-07', time: '07:00' }; // Lunes. El reloj no depende de la fecha de ejecución.
const input = (extra = {}) => ({ patient_id: patient, dentist_id: 1, branch_id: 1, date: now.date, start_time: '09:00', end_time: '09:30', reason: 'Control', ...extra });
function book(extra) { return s.createAppointment(db, reception, input(extra), now).id; }
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dentalcare-test-')); filename = path.join(directory, 'test.sqlite'); db = openDatabase(filename);
  db.exec(`INSERT INTO branches VALUES (1,'Franco'),(2,'CDE'),(3,'Hernandarias');
    INSERT INTO specialties VALUES (1,'Ortodoncia'); INSERT INTO dentists VALUES (1,'Dra. Uno',1,1),(2,'Dr. Dos',1,1),(3,'Dra. Tres',1,1);
    INSERT INTO dentist_branches VALUES (1,1),(1,2),(2,1),(3,3);
    INSERT INTO availabilities(dentist_id,branch_id,weekday,start_time,end_time) VALUES (1,1,1,'08:00','12:00'),(1,2,1,'13:00','20:00'),(2,1,1,'08:00','20:00'),(3,3,1,'08:00','20:00');`);
  const first = s.createUser(db, { name: 'Recepción', email: 'r@test.local', password: 'Password-test-123', role: 'recepcionista' });
  const second = s.createUser(db, { name: 'Dra. Uno', email: 'd@test.local', password: 'Password-test-123', role: 'odontologo', dentist_id: 1 });
  const third = s.createUser(db, { name: 'Dr. Dos', email: 'd2@test.local', password: 'Password-test-123', role: 'odontologo', dentist_id: 2 });
  reception = db.prepare('SELECT * FROM users WHERE id=?').get(first);
  doctor = db.prepare('SELECT * FROM users WHERE id=?').get(second);
  other = db.prepare('SELECT * FROM users WHERE id=?').get(third);
  patient = s.savePatient(db, reception, { first_name: 'María', last_name: 'Vera', identity_number: '001.234-5', dentist_id: 1 }).id;
});
afterEach(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

test('01 · Sesiones, permisos por rol y protección de origen', () => {
  assert.throws(() => login(db, 'r@test.local', 'incorrecta'), /incorrectos/);
  const token = login(db, 'R@test.local', 'Password-test-123');
  assert.equal(sessionUser(db, token).role, 'recepcionista');
  assert.notEqual(db.prepare('SELECT token_hash FROM sessions').get().token_hash, token);
  assert.equal(db.prepare('SELECT token_hash FROM sessions').get().token_hash, digest(token));
  assert.throws(() => s.savePatient(db, doctor, {}), /permiso/);
  assert.throws(() => s.createAppointment(db, null, input(), now), /iniciar sesión/);
  assert.throws(() => checkOrigin(new Request('http://localhost:3000/api/patients', { headers: { origin: 'https://evil.example' } })), /otro sitio/);
  checkOrigin(new Request('http://localhost:3000/api/patients', { headers: { origin: 'http://localhost:3000' } }));
  logout(db, token); assert.equal(sessionUser(db, token), null);
  const expired = login(db, 'r@test.local', 'Password-test-123');
  db.prepare('UPDATE sessions SET expires_at=0').run(); assert.equal(sessionUser(db, expired), null);
  assert.ok(reception.password_hash.startsWith('scrypt$'));
});
test('02 · Cédula normalizada, unicidad y búsqueda', () => {
  assert.equal(db.prepare('SELECT identity_number FROM patients WHERE id=?').get(patient).identity_number, '0012345');
  assert.throws(() => s.savePatient(db, reception, { first_name: 'Otra', last_name: 'Persona', identity_number: '00 123/45' }), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  assert.equal(s.listPatients(db, reception, '00.123-45').length, 1);
  assert.equal(s.listPatients(db, reception, 'Vera').length, 1);
  assert.throws(() => s.savePatient(db, reception, { first_name: '', last_name: 'Vera', identity_number: '123' }), /Nombre/);
});
test('03 · Reserva válida y turnos consecutivos', () => {
  const first = book(); const second = book({ start_time: '09:30', end_time: '10:00' });
  assert.notEqual(first, second);
  assert.equal(s.listAppointments(db, doctor, { date: now.date }).length, 2);
  const slots = s.availableSlots(db, reception, { dentist_id: 1, branch_id: 1, date: now.date, duration: 30 }, now);
  assert.ok(slots.some(slot => slot.start_time === '10:00'));
  assert.ok(!slots.some(slot => slot.start_time === '09:15'));
});
test('04 · Rechaza horarios inválidos, pasados, inactivos y superposiciones entre sucursales', () => {
  book();
  assert.throws(() => book({ start_time: '09:15', end_time: '09:45' }), /superpone/);
  assert.throws(() => book({ start_time: '11:45', end_time: '12:15' }), /disponibilidad/);
  assert.throws(() => book({ start_time: '07:30', end_time: '08:30' }), /08:00/);
  assert.throws(() => book({ start_time: '10:00', end_time: '09:00' }), /posterior/);
  assert.throws(() => book({ date: '2030-02-30' }), /Fecha/);
  assert.throws(() => book({ date: '2029-01-01' }), /pasado/);
  assert.throws(() => book({ dentist_id: 3, branch_id: 1 }), /registro/);
  db.prepare('UPDATE dentists SET active=0 WHERE id=2').run();
  assert.throws(() => book({ dentist_id: 2 }), /registro/);
  // Incluso si existiera un bloque inconsistente importado directamente, el cruce global se rechaza.
  db.exec("INSERT INTO availabilities(dentist_id,branch_id,weekday,start_time,end_time) VALUES (1,2,1,'08:00','12:00')");
  assert.throws(() => book({ branch_id: 2 }), /superpone/);
});
test('05 · Dos conexiones simultáneas: exactamente una reserva', async () => {
  const workers = [1, 2].map(() => new Worker(new URL('./booking-worker.js', import.meta.url), { workerData: { filename, actor: reception, input: input(), now } }));
  await Promise.all(workers.map(w => once(w, 'message')));
  const results = workers.map(w => once(w, 'message').then(([result]) => result));
  workers.forEach(w => w.postMessage('start'));
  const outcomes = await Promise.all(results);
  assert.equal(outcomes.filter(r => r.ok).length, 1);
  assert.equal(outcomes.filter(r => r.status === 409).length, 1);
  assert.equal(db.prepare('SELECT count(*) AS total FROM appointments').get().total, 1);
  await Promise.all(workers.map(w => w.terminate()));
});
test('06 · Cancelación conserva el registro, libera horario y protege pacientes con registros', () => {
  const a = book(); s.changeStatus(db, reception, a, 'cancelado', now);
  assert.equal(s.appointmentDetail(db, reception, a).appointment.status, 'cancelado');
  assert.ok(book() > a);
  assert.equal(db.prepare('SELECT count(*) AS total FROM appointments').get().total, 2);
  assert.throws(() => s.changeStatus(db, reception, a, 'ausente', now), /programado/);
  assert.throws(() => s.deletePatient(db, reception, patient), /turnos o atenciones/);
});
test('07 · Reprogramación atómica y conservación del original ante conflicto', () => {
  const a = book(); book({ start_time: '10:00', end_time: '10:30' });
  assert.throws(() => s.rescheduleAppointment(db, reception, a, { date: now.date, start_time: '10:15', end_time: '10:45' }, now), /superpone/);
  assert.equal(s.appointmentDetail(db, reception, a).appointment.start_time, '09:00');
  assert.equal(db.prepare('SELECT count(*) AS total FROM appointment_changes').get().total, 0);
  s.rescheduleAppointment(db, reception, a, { date: now.date, start_time: '11:00', end_time: '11:30', patient_id: 999, branch_id: 2 }, now);
  const detail = s.appointmentDetail(db, reception, a);
  assert.equal(detail.appointment.start_time, '11:00'); assert.equal(detail.appointment.patient_id, patient); assert.equal(detail.appointment.branch_id, 1);
  assert.equal(detail.changes[0].old_start, '09:00'); assert.equal(detail.changes[0].new_start, '11:00'); assert.equal(detail.changes[0].user_id, reception.id);
  assert.ok(detail.changes[0].changed_at); assert.ok(book());
});
test('08 · Inasistencia solo después del final; sin atención ni reactivación', () => {
  const a = book();
  assert.throws(() => s.changeStatus(db, reception, a, 'ausente', { ...now, time: '09:15' }), /finalizado/);
  s.changeStatus(db, reception, a, 'ausente', { ...now, time: '10:00' });
  assert.equal(s.appointmentDetail(db, reception, a).appointment.status, 'ausente');
  assert.equal(db.prepare('SELECT count(*) AS total FROM clinical_visits').get().total, 0);
  assert.throws(() => s.rescheduleAppointment(db, reception, a, { date: now.date, start_time: '11:00', end_time: '11:30' }, now), /programados/);
});
test('09 · Atención propia, transacción, duplicados y privacidad clínica', () => {
  const a = book(); const attended = { ...now, time: '09:30' };
  assert.throws(() => s.recordVisit(db, other, a, { treatment: 'No autorizado' }, attended), /propios turnos/);
  assert.throws(() => s.recordVisit(db, reception, a, { treatment: 'No autorizado' }, attended), /permiso/);
  assert.throws(() => s.recordVisit(db, doctor, a, { treatment: 'Demasiado temprano' }, now), /inicio/);
  s.recordVisit(db, doctor, a, { treatment: 'Atención clínica privada', next_date: '2030-01-14', next_procedure: 'Control' }, attended);
  assert.equal(s.appointmentDetail(db, doctor, a).appointment.status, 'atendido');
  assert.throws(() => s.recordVisit(db, doctor, a, { treatment: 'Duplicada' }, attended), /ya fue atendido/);
  assert.throws(() => db.prepare('INSERT INTO clinical_visits(appointment_id,patient_id,dentist_id,treatment) VALUES (?,?,?,?)').run(a, patient, 1, 'Duplicada SQL'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  assert.equal(s.patientDetail(db, reception, patient).visits, null);
  assert.equal(s.appointmentDetail(db, reception, a).visit, null);
  assert.throws(() => s.patientDetail(db, other, patient), /acceso/);
  assert.ok(!JSON.stringify(s.patientDetail(db, reception, patient)).includes('Atención clínica privada'));
  assert.throws(() => s.changeStatus(db, reception, a, 'cancelado', attended), /programado/);
  assert.equal(db.prepare('SELECT count(*) AS total FROM appointments').get().total, 1, 'seguimiento no crea turno');
});
test('10 · Cambiar asignación conserva historial y aplica la regla de acceso central', () => {
  const a = book(); s.recordVisit(db, doctor, a, { treatment: 'Historial original' }, { ...now, time: '10:00' });
  const before = db.prepare('SELECT * FROM clinical_visits').all();
  s.savePatient(db, reception, { first_name: 'María', last_name: 'Vera', identity_number: '0012345', dentist_id: 2 }, patient);
  assert.deepEqual(db.prepare('SELECT * FROM clinical_visits').all(), before);
  assert.equal(s.patientDetail(db, other, patient).visits[0].dentist_id, 1);
  assert.equal(s.patientDetail(db, doctor, patient).visits[0].treatment, 'Historial original');
  const p = s.savePatient(db, reception, { first_name: 'Luis', last_name: 'Vera', identity_number: '987654', dentist_id: 1 }).id;
  s.savePatient(db, reception, { first_name: 'Luis', last_name: 'Vera', identity_number: '987654', dentist_id: 2 }, p);
  assert.equal(s.canReadClinical(db, doctor, p), false);
});
test('Extra · Disponibilidad y desactivación no invalidan turnos futuros', () => {
  const a = book();
  const professional = { name: 'Dra. Uno', specialty_id: 1, active: true, branches: [1, 2], availability: [{ branch_id: 1, weekday: 1, start_time: '08:00', end_time: '12:00' }, { branch_id: 2, weekday: 1, start_time: '13:00', end_time: '20:00' }] };
  assert.throws(() => s.saveDentist(db, reception, { ...professional, active: false }, 1, now), /fuera de disponibilidad/);
  assert.throws(() => s.saveDentist(db, reception, { ...professional, availability: [] }, 1, now), /fuera de disponibilidad/);
  assert.throws(() => s.saveDentist(db, reception, { ...professional, availability: [...professional.availability, { branch_id: 2, weekday: 1, start_time: '11:00', end_time: '14:00' }] }, 1, now), /superponen/);
  assert.equal(db.prepare('SELECT active FROM dentists WHERE id=1').get().active, 1);
  assert.equal(db.prepare('SELECT count(*) AS total FROM availabilities WHERE dentist_id=1').get().total, 2);
  s.changeStatus(db, reception, a, 'cancelado', now); s.saveDentist(db, reception, { ...professional, active: false }, 1, now);
  assert.equal(db.prepare('SELECT active FROM dentists WHERE id=1').get().active, 0);
});
test('Extra · Claves foráneas, WAL, base ocupada y copia consistente', async () => {
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1); assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  const second = openDatabase(filename); second.pragma('busy_timeout=10');
  db.exec('BEGIN IMMEDIATE');
  try {
    assert.throws(() => s.createAppointment(second, reception, input(), now), error => {
      assert.equal(error.code, 'SQLITE_BUSY'); assert.equal(s.publicError(error).status, 503); return true;
    });
  } finally { db.exec('ROLLBACK'); second.close(); }
  book();
  const backupFile = path.join(directory, 'backup.sqlite'); await db.backup(backupFile);
  const backup = openDatabase(backupFile);
  assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(backup.prepare('SELECT count(*) AS total FROM appointments').get().total, 1); backup.close();
});
