import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { openDatabase, one, all, transaction } from '../lib/db.js';
import { login, sessionUser, logout, checkOrigin, digest } from '../lib/security.js';
import * as s from '../lib/services.js';

const schemaSql = await fs.readFile(new URL('../migrations-postgres/001_initial.sql', import.meta.url), 'utf8');
const now = { date: '2030-01-07', time: '07:00' };
const password = 'Password-test-123';
async function fixtures(db) {
  await db.query(`INSERT INTO branches VALUES (1,'Franco'),(2,'CDE'),(3,'Hernandarias');
    INSERT INTO specialties VALUES (1,'Ortodoncia');
    INSERT INTO dentists VALUES (1,'Dra. Uno',1,1),(2,'Dr. Dos',1,1),(3,'Dra. Tres',1,1);
    INSERT INTO dentist_branches VALUES (1,1),(1,2),(2,1),(3,3);
    INSERT INTO availabilities(dentist_id,branch_id,weekday,start_time,end_time)
    VALUES (1,1,1,'08:00','12:00'),(1,2,1,'13:00','20:00'),(2,1,1,'08:00','20:00'),(3,3,1,'08:00','20:00');`);
  const receptionId = await s.createUser(db, { name: 'Recepción', email: 'r@test.local', password, role: 'recepcionista' });
  const doctorId = await s.createUser(db, { name: 'Dra. Uno', email: 'd@test.local', password, role: 'odontologo', dentist_id: 1 });
  const otherId = await s.createUser(db, { name: 'Dr. Dos', email: 'd2@test.local', password, role: 'odontologo', dentist_id: 2 });
  const reception = await one(db, 'SELECT * FROM users WHERE id=$1', [receptionId]);
  const doctor = await one(db, 'SELECT * FROM users WHERE id=$1', [doctorId]);
  const other = await one(db, 'SELECT * FROM users WHERE id=$1', [otherId]);
  const patient = (await s.savePatient(db, reception, { first_name: 'María', last_name: 'Vera', identity_number: '001.234-5', dentist_id: 1 })).id;
  return { reception, doctor, other, patient };
}
function booking(patient, extra = {}) {
  return { patient_id: patient, dentist_id: 1, branch_id: 1, date: now.date, start_time: '09:00', end_time: '09:30', reason: 'Control', ...extra };
}

describe('Dominio PostgreSQL', { skip: !process.env.DATABASE_URL }, () => {
  let pool, db, reception, doctor, other, patient;
  const book = async extra => (await s.createAppointment(db, reception, booking(patient, extra), now)).id;
  beforeEach(async () => {
    pool = openDatabase();
    db = await pool.connect();
    await db.query('BEGIN');
    await db.query('SET LOCAL search_path TO pg_temp');
    await db.query(schemaSql.replaceAll('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE'));
    ({ reception, doctor, other, patient } = await fixtures(db));
  });
  afterEach(async () => {
    try { if (db) await db.query('ROLLBACK'); }
    finally { if (db) db.release(); if (pool) await pool.end(); }
  });

  test('Sesiones, permisos y protección de origen', async () => {
    await assert.rejects(login(db, 'r@test.local', 'incorrecta'), /incorrectos/);
    const token = await login(db, 'R@test.local', password);
    assert.equal((await sessionUser(db, token)).role, 'recepcionista');
    assert.equal((await one(db, 'SELECT token_hash FROM sessions')).token_hash, digest(token));
    await assert.rejects(s.savePatient(db, doctor, {}), /permiso/);
    await assert.rejects(s.createAppointment(db, null, booking(patient), now), /iniciar sesión/);
    assert.throws(() => checkOrigin(new Request('http://localhost:3000/api/patients', { headers: { origin: 'https://evil.example' } })), /otro sitio/);
    checkOrigin(new Request('http://localhost:3000/api/patients', { headers: { origin: 'http://localhost:3000' } }));
    await logout(db, token);
    assert.equal(await sessionUser(db, token), null);
  });

  test('Cédula normalizada, unicidad, búsqueda y validación', async () => {
    assert.equal((await one(db, 'SELECT identity_number FROM patients WHERE id=$1', [patient])).identity_number, '0012345');
    await assert.rejects(s.savePatient(db, reception, { first_name: 'Otra', last_name: 'Persona', identity_number: '00 123/45' }), { code: '23505' });
    assert.equal((await s.listPatients(db, reception, '00.123-45')).length, 1);
    assert.equal((await s.listPatients(db, reception, 'vera')).length, 1);
    await assert.rejects(s.savePatient(db, reception, { first_name: '', last_name: 'Vera', identity_number: '123' }), /Nombre/);
  });

  test('Reservas consecutivas, filtros y sugerencias', async () => {
    assert.notEqual(await book(), await book({ start_time: '09:30', end_time: '10:00' }));
    assert.equal((await s.listAppointments(db, doctor, { date: now.date, branch_id: 1 })).length, 2);
    assert.equal((await s.listAppointments(db, reception, { dentist_id: 2 })).length, 0);
    const slots = await s.availableSlots(db, reception, { dentist_id: 1, branch_id: 1, date: now.date, duration: 30 }, now);
    assert.ok(slots.some(slot => slot.start_time === '10:00'));
    assert.ok(!slots.some(slot => slot.start_time === '09:15'));
    assert.equal((await s.referenceData(db, reception)).branches.length, 3);
    assert.equal((await s.dentistsWithAvailability(db, reception))[0].availability.length > 0, true);
  });

  test('Horarios, fechas y superposición entre sucursales', async () => {
    await book();
    await assert.rejects(book({ start_time: '09:15', end_time: '09:45' }), /superpone/);
    await assert.rejects(book({ start_time: '11:45', end_time: '12:15' }), /disponibilidad/);
    await assert.rejects(book({ start_time: '07:30', end_time: '08:30' }), /08:00/);
    await assert.rejects(book({ start_time: '10:00', end_time: '09:00' }), /posterior/);
    await assert.rejects(book({ date: '2030-02-30' }), /Fecha/);
    await assert.rejects(book({ date: '2029-01-01' }), /pasado/);
    await assert.rejects(book({ dentist_id: 3, branch_id: 1 }), /registro/);
    await db.query('UPDATE dentists SET active=0 WHERE id=2');
    await assert.rejects(book({ dentist_id: 2 }), /registro/);
    await db.query("INSERT INTO availabilities(dentist_id,branch_id,weekday,start_time,end_time) VALUES (1,2,1,'08:00','12:00')");
    await assert.rejects(book({ branch_id: 2 }), /superpone/);
  });

  test('Cancelación conserva el registro y libera el horario', async () => {
    const appointment = await book();
    await s.changeStatus(db, reception, appointment, 'cancelado', now);
    assert.equal((await s.appointmentDetail(db, reception, appointment)).appointment.status, 'cancelado');
    assert.ok(await book() > appointment);
    assert.equal((await all(db, 'SELECT * FROM appointments')).length, 2);
    await assert.rejects(s.changeStatus(db, reception, appointment, 'ausente', now), /programado/);
    await assert.rejects(s.deletePatient(db, reception, patient), /turnos o atenciones/);
  });

  test('Reprogramación atómica con auditoría y conservación ante conflicto', async () => {
    const appointment = await book();
    await book({ start_time: '10:00', end_time: '10:30' });
    await assert.rejects(s.rescheduleAppointment(db, reception, appointment, { date: now.date, start_time: '10:15', end_time: '10:45' }, now), /superpone/);
    assert.equal((await s.appointmentDetail(db, reception, appointment)).appointment.start_time, '09:00');
    assert.equal((await all(db, 'SELECT * FROM appointment_changes')).length, 0);
    await s.rescheduleAppointment(db, reception, appointment, { date: now.date, start_time: '11:00', end_time: '11:30', patient_id: 999, branch_id: 2 }, now);
    const detail = await s.appointmentDetail(db, reception, appointment);
    assert.equal(detail.appointment.patient_id, patient);
    assert.equal(detail.appointment.branch_id, 1);
    assert.equal(detail.changes[0].old_start, '09:00');
    assert.equal(detail.changes[0].new_start, '11:00');
    assert.equal(detail.changes[0].user_id, reception.id);
    assert.ok(detail.changes[0].changed_at instanceof Date);
  });

  test('Inasistencia después del final y sin reactivación', async () => {
    const appointment = await book();
    await assert.rejects(s.changeStatus(db, reception, appointment, 'ausente', { ...now, time: '09:15' }), /finalizado/);
    await s.changeStatus(db, reception, appointment, 'ausente', { ...now, time: '10:00' });
    assert.equal((await s.appointmentDetail(db, reception, appointment)).appointment.status, 'ausente');
    assert.equal((await all(db, 'SELECT * FROM clinical_visits')).length, 0);
    await assert.rejects(s.rescheduleAppointment(db, reception, appointment, { date: now.date, start_time: '11:00', end_time: '11:30' }, now), /programados/);
  });

  test('Atención propia, duplicados y privacidad clínica', async () => {
    const appointment = await book();
    const attended = { ...now, time: '09:30' };
    await assert.rejects(s.recordVisit(db, other, appointment, { treatment: 'No autorizado' }, attended), /propios turnos/);
    await assert.rejects(s.recordVisit(db, reception, appointment, { treatment: 'No autorizado' }, attended), /permiso/);
    await assert.rejects(s.recordVisit(db, doctor, appointment, { treatment: 'Temprano' }, now), /inicio/);
    await s.recordVisit(db, doctor, appointment, { treatment: 'Atención clínica privada', next_date: '2030-01-14', next_procedure: 'Control' }, attended);
    assert.equal((await s.appointmentDetail(db, doctor, appointment)).appointment.status, 'atendido');
    await assert.rejects(s.recordVisit(db, doctor, appointment, { treatment: 'Duplicada' }, attended), /ya fue atendido/);
    assert.equal((await s.patientDetail(db, reception, patient)).visits, null);
    assert.equal((await s.appointmentDetail(db, reception, appointment)).visit, null);
    await assert.rejects(s.patientDetail(db, other, patient), /acceso/);
    assert.ok(!JSON.stringify(await s.patientDetail(db, reception, patient)).includes('Atención clínica privada'));
    assert.equal((await all(db, 'SELECT * FROM appointments')).length, 1);
  });

  test('Cambiar asignación conserva el historial y aplica acceso central', async () => {
    const appointment = await book();
    await s.recordVisit(db, doctor, appointment, { treatment: 'Historial original' }, { ...now, time: '10:00' });
    const before = await all(db, 'SELECT * FROM clinical_visits');
    await s.savePatient(db, reception, { first_name: 'María', last_name: 'Vera', identity_number: '0012345', dentist_id: 2 }, patient);
    assert.deepEqual(await all(db, 'SELECT * FROM clinical_visits'), before);
    assert.equal((await s.patientDetail(db, other, patient)).visits[0].dentist_id, 1);
    assert.equal((await s.patientDetail(db, doctor, patient)).visits[0].treatment, 'Historial original');
    const secondPatient = (await s.savePatient(db, reception, { first_name: 'Luis', last_name: 'Vera', identity_number: '987654', dentist_id: 1 })).id;
    await s.savePatient(db, reception, { first_name: 'Luis', last_name: 'Vera', identity_number: '987654', dentist_id: 2 }, secondPatient);
    assert.equal(await s.canReadClinical(db, doctor, secondPatient), false);
  });

  test('Disponibilidad y desactivación protegen turnos futuros', async () => {
    const appointment = await book();
    const professional = { name: 'Dra. Uno', specialty_id: 1, active: true, branches: [1, 2], availability: [{ branch_id: 1, weekday: 1, start_time: '08:00', end_time: '12:00' }, { branch_id: 2, weekday: 1, start_time: '13:00', end_time: '20:00' }] };
    await assert.rejects(s.saveDentist(db, reception, { ...professional, active: false }, 1, now), /fuera de disponibilidad/);
    await assert.rejects(s.saveDentist(db, reception, { ...professional, availability: [] }, 1, now), /fuera de disponibilidad/);
    await assert.rejects(s.saveDentist(db, reception, { ...professional, availability: [...professional.availability, { branch_id: 2, weekday: 1, start_time: '11:00', end_time: '14:00' }] }, 1, now), /superponen/);
    assert.equal((await one(db, 'SELECT active FROM dentists WHERE id=1')).active, 1);
    await s.changeStatus(db, reception, appointment, 'cancelado', now);
    await s.saveDentist(db, reception, { ...professional, active: false }, 1, now);
    assert.equal((await one(db, 'SELECT active FROM dentists WHERE id=1')).active, 0);
  });

  test('Claves foráneas y errores PostgreSQL', async () => {
    await assert.rejects(transaction(db, client => client.query('INSERT INTO patients(first_name,last_name,identity_number,dentist_id) VALUES ($1,$2,$3,$4)', ['X','Y','9999',9999])), { code: '23503' });
    assert.equal(s.publicError({ code: '23503' }).status, 400);
    assert.equal(s.publicError({ code: '23505' }).status, 409);
    assert.equal(s.publicError({ code: '40P01' }).status, 503);
  });
});

test('Dos conexiones PostgreSQL simultáneas reservan exactamente una vez', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = openDatabase();
  const schema = 'dentalcare_test_' + randomBytes(8).toString('hex');
  assert.match(schema, /^dentalcare_test_[a-f0-9]{16}$/);
  let created = false;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const data = await transaction(pool, async client => {
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(schemaSql);
      return fixtures(client);
    });
    const reserve = () => transaction(pool, async client => {
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      return s.createAppointment(client, data.reception, booking(data.patient), now);
    });
    const results = await Promise.allSettled([reserve(), reserve()]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
    assert.equal((await pool.query(`SELECT count(*)::integer AS count FROM "${schema}".appointments`)).rows[0].count, 1);
  } finally {
    try { if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await pool.end(); }
  }
});