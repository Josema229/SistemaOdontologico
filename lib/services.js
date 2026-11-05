import { AppError, hashPassword } from './security.js';
import { localNow, validDate, weekday, minute, clock } from './time.js';

export const STATES = { programado: 'Programado', atendido: 'Atendido', cancelado: 'Cancelado', ausente: 'Ausente' };
export function authorized(actor, role) {
  if (!actor) throw new AppError('Debes iniciar sesión.', 401);
  if (role && actor.role !== role) throw new AppError('No tienes permiso para esta operación.', 403);
}
function required(value, label, max = 200) {
  const result = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!result || result.length > max) throw new AppError(`${label}: completa el campo (máximo ${max} caracteres).`);
  return result;
}
function id(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new AppError('Identificador inválido.');
  return number;
}
export function normalizeIdentity(value) {
  const normalized = required(value, 'Cédula', 40).replace(/[\s.\-/]/g, '');
  if (!/^\d{3,20}$/.test(normalized)) throw new AppError('La cédula debe contener entre 3 y 20 dígitos.');
  return normalized;
}
function found(record) { if (!record) throw new AppError('No se encontró el registro.', 404); return record; }
const appointmentSelect = `SELECT a.*, p.first_name || ' ' || p.last_name AS patient_name,
 d.name AS dentist_name,b.name AS branch_name FROM appointments a
 JOIN patients p ON p.id=a.patient_id JOIN dentists d ON d.id=a.dentist_id JOIN branches b ON b.id=a.branch_id`;

export function referenceData(db, actor) {
  authorized(actor);
  return {
    branches: db.prepare('SELECT * FROM branches ORDER BY id').all(),
    specialties: db.prepare('SELECT * FROM specialties ORDER BY id').all(),
    dentists: db.prepare(`SELECT d.*,s.name AS specialty FROM dentists d JOIN specialties s ON s.id=d.specialty_id ORDER BY d.name`).all(),
  };
}

// Propuesta provisional: asignación actual O cualquier turno no cancelado del profesional.
// Esta función es el único punto de decisión para lectura de ficha e historial clínico.
export function canReadClinical(db, actor, patientId) {
  return actor?.role === 'odontologo' && Boolean(db.prepare(`SELECT 1 FROM patients p WHERE p.id=? AND
    (p.dentist_id=? OR EXISTS(SELECT 1 FROM appointments a WHERE a.patient_id=p.id AND a.dentist_id=? AND a.status!='cancelado'))`)
    .get(patientId, actor.dentist_id, actor.dentist_id));
}
export function listPatients(db, actor, search = '') {
  authorized(actor);
  const query = '%' + String(search).trim().slice(0, 100) + '%';
  const normalized = '%' + String(search).replace(/[\s.\-/]/g, '') + '%';
  let sql = `SELECT p.*,d.name AS dentist_name FROM patients p LEFT JOIN dentists d ON d.id=p.dentist_id
    WHERE (p.first_name LIKE ? OR p.last_name LIKE ? OR (p.first_name || ' ' || p.last_name) LIKE ? OR p.identity_number LIKE ?)`;
  const params = [query, query, query, normalized];
  if (actor.role === 'odontologo') {
    sql += ` AND (p.dentist_id=? OR EXISTS(SELECT 1 FROM appointments a WHERE a.patient_id=p.id AND a.dentist_id=? AND a.status!='cancelado'))`;
    params.push(actor.dentist_id, actor.dentist_id);
  }
  return db.prepare(sql + ' ORDER BY p.last_name,p.first_name').all(...params);
}
export function patientDetail(db, actor, patientId) {
  authorized(actor); patientId = id(patientId);
  const patient = found(db.prepare(`SELECT p.*,d.name AS dentist_name FROM patients p LEFT JOIN dentists d ON d.id=p.dentist_id WHERE p.id=?`).get(patientId));
  if (actor.role === 'odontologo' && !canReadClinical(db, actor, patientId)) throw new AppError('No tienes acceso a este paciente.', 403);
  const appointments = db.prepare(appointmentSelect + ' WHERE a.patient_id=?' + (actor.role === 'odontologo' ? ' AND a.dentist_id=?' : '') + ' ORDER BY a.date DESC,a.start_time DESC')
    .all(...(actor.role === 'odontologo' ? [patientId, actor.dentist_id] : [patientId]));
  // Recepción nunca recibe contenido clínico, tampoco como un campo oculto del HTML o JSON.
  const visits = canReadClinical(db, actor, patientId) ? db.prepare(`SELECT v.*,d.name AS dentist_name FROM clinical_visits v
    JOIN dentists d ON d.id=v.dentist_id WHERE patient_id=? ORDER BY attended_at DESC,v.id DESC`).all(patientId) : null;
  return { patient, appointments, visits };
}
export function savePatient(db, actor, input, patientId) {
  authorized(actor, 'recepcionista');
  const first = required(input.first_name, 'Nombre', 80), last = required(input.last_name, 'Apellido', 80);
  const identity = normalizeIdentity(input.identity_number);
  const phone = typeof input.phone === 'string' ? input.phone.trim().slice(0, 40) : '';
  const dentist = input.dentist_id ? id(input.dentist_id) : null;
  return db.transaction(() => {
    if (dentist) found(db.prepare('SELECT id FROM dentists WHERE id=? AND active=1').get(dentist));
    if (patientId) {
      found(db.prepare('SELECT id FROM patients WHERE id=?').get(id(patientId)));
      db.prepare('UPDATE patients SET first_name=?,last_name=?,identity_number=?,phone=?,dentist_id=? WHERE id=?').run(first, last, identity, phone, dentist, id(patientId));
      return { id: Number(patientId) };
    }
    return { id: Number(db.prepare('INSERT INTO patients(first_name,last_name,identity_number,phone,dentist_id) VALUES (?,?,?,?,?)').run(first, last, identity, phone, dentist).lastInsertRowid) };
  }).immediate();
}
export function deletePatient(db, actor, patientId) {
  authorized(actor, 'recepcionista'); patientId = id(patientId);
  return db.transaction(() => {
    found(db.prepare('SELECT id FROM patients WHERE id=?').get(patientId));
    if (db.prepare('SELECT 1 FROM appointments WHERE patient_id=?').get(patientId) || db.prepare('SELECT 1 FROM clinical_visits WHERE patient_id=?').get(patientId)) throw new AppError('No se puede eliminar un paciente con turnos o atenciones.');
    db.prepare('DELETE FROM patients WHERE id=?').run(patientId);
    return { ok: true };
  }).immediate();
}
export function dentistsWithAvailability(db, actor) {
  authorized(actor, 'recepcionista');
  return referenceData(db, actor).dentists.map(d => ({ ...d,
    branches: db.prepare('SELECT branch_id FROM dentist_branches WHERE dentist_id=?').all(d.id).map(b => b.branch_id),
    availability: db.prepare('SELECT * FROM availabilities WHERE dentist_id=? ORDER BY weekday,start_time').all(d.id),
  }));
}
function timeRange(start, end) {
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(start) || !timePattern.test(end) || start >= end || start < '08:00' || end > '20:00') {
    throw new AppError('El horario debe estar entre 08:00 y 20:00 y la hora final debe ser posterior a la inicial.');
  }
}
function validateSlot(db, data, excludeId, now) {
  if (!validDate(data.date)) throw new AppError('Fecha inválida.');
  timeRange(data.start_time, data.end_time);
  if (`${data.date} ${data.start_time}` <= `${now.date} ${now.time}`) throw new AppError('No se puede reservar en el pasado ni en el minuto actual.');
  found(db.prepare(`SELECT d.id FROM dentists d JOIN dentist_branches b ON b.dentist_id=d.id
    WHERE d.id=? AND d.active=1 AND b.branch_id=?`).get(id(data.dentist_id), id(data.branch_id)));
  if (!db.prepare(`SELECT 1 FROM availabilities WHERE dentist_id=? AND branch_id=? AND weekday=? AND start_time<=? AND end_time>=?`)
    .get(data.dentist_id, data.branch_id, weekday(data.date), data.start_time, data.end_time)) throw new AppError('El turno completo debe estar dentro de un bloque de disponibilidad del odontólogo.');
  if (db.prepare(`SELECT id FROM appointments WHERE dentist_id=? AND date=? AND status!='cancelado'
    AND start_time<? AND end_time>? AND id!=?`).get(data.dentist_id, data.date, data.end_time, data.start_time, excludeId || 0)) {
    throw new AppError('El odontólogo ya tiene un turno que se superpone, posiblemente en otra sucursal.', 409);
  }
}
export function saveDentist(db, actor, input, dentistId, now = localNow()) {
  authorized(actor, 'recepcionista');
  const name = required(input.name, 'Nombre del profesional', 120), specialty = id(input.specialty_id);
  const active = input.active === true || input.active === '1' ? 1 : 0;
  if (!Array.isArray(input.branches) || !input.branches.length) throw new AppError('Selecciona al menos una sucursal.');
  const branches = [...new Set(input.branches.map(id))];
  if (!Array.isArray(input.availability) || input.availability.length > 100) throw new AppError('Disponibilidad inválida.');
  const blocks = input.availability.map(b => ({ branch_id: id(b.branch_id), weekday: Number(b.weekday), start_time: b.start_time, end_time: b.end_time }));
  for (const b of blocks) {
    if (!branches.includes(b.branch_id) || !Number.isInteger(b.weekday) || b.weekday < 0 || b.weekday > 6) throw new AppError('Revisa el día y la sucursal de cada bloque.');
    timeRange(b.start_time, b.end_time);
  }
  blocks.forEach((b, index) => {
    if (blocks.some((other, j) => j !== index && other.weekday === b.weekday && other.start_time < b.end_time && other.end_time > b.start_time)) throw new AppError('Los bloques del profesional se superponen, incluso entre sucursales.');
  });
  return db.transaction(() => {
    found(db.prepare('SELECT id FROM specialties WHERE id=?').get(specialty));
    branches.forEach(b => found(db.prepare('SELECT id FROM branches WHERE id=?').get(b)));
    if (dentistId) {
      dentistId = id(dentistId); found(db.prepare('SELECT id FROM dentists WHERE id=?').get(dentistId));
      const future = db.prepare(`SELECT * FROM appointments WHERE dentist_id=? AND status='programado'
        AND (date>? OR (date=? AND end_time>?))`).all(dentistId, now.date, now.date, now.time);
      const conflicts = future.filter(a => !active || !blocks.some(b => b.branch_id === a.branch_id && b.weekday === weekday(a.date) && b.start_time <= a.start_time && b.end_time >= a.end_time));
      if (conflicts.length) throw new AppError(`El cambio deja ${conflicts.length} turno(s) fuera de disponibilidad: ${conflicts.slice(0, 5).map(a => '#' + a.id + ' ' + a.date + ' ' + a.start_time).join(', ')}. Primero cancela esos turnos con confirmación o reprograma dentro de la disponibilidad actual; después modifica el profesional.`, 409);
      db.prepare('UPDATE dentists SET name=?,specialty_id=?,active=? WHERE id=?').run(name, specialty, active, dentistId);
      db.prepare('DELETE FROM availabilities WHERE dentist_id=?').run(dentistId);
      // Mantener relaciones históricas referenciadas por turnos.
      for (const old of db.prepare('SELECT branch_id FROM dentist_branches WHERE dentist_id=?').all(dentistId)) {
        if (!branches.includes(old.branch_id)) {
          if (db.prepare('SELECT 1 FROM appointments WHERE dentist_id=? AND branch_id=?').get(dentistId, old.branch_id)) throw new AppError('No puedes quitar una sucursal con turnos históricos. Conserva la asignación y elimina sus bloques de disponibilidad.');
          db.prepare('DELETE FROM dentist_branches WHERE dentist_id=? AND branch_id=?').run(dentistId, old.branch_id);
        }
      }
    } else dentistId = Number(db.prepare('INSERT INTO dentists(name,specialty_id,active) VALUES (?,?,?)').run(name, specialty, active).lastInsertRowid);
    branches.forEach(b => db.prepare('INSERT OR IGNORE INTO dentist_branches VALUES (?,?)').run(dentistId, b));
    blocks.forEach(b => db.prepare('INSERT INTO availabilities(dentist_id,branch_id,weekday,start_time,end_time) VALUES (?,?,?,?,?)').run(dentistId, b.branch_id, b.weekday, b.start_time, b.end_time));
    return { id: dentistId };
  }).immediate();
}
export function listAppointments(db, actor, filters = {}) {
  authorized(actor);
  let sql = appointmentSelect + ' WHERE 1=1'; const params = [];
  if (filters.date) { if (!validDate(filters.date)) throw new AppError('Fecha inválida.'); sql += ' AND a.date=?'; params.push(filters.date); }
  if (filters.branch_id) { sql += ' AND a.branch_id=?'; params.push(id(filters.branch_id)); }
  if (actor.role === 'odontologo') { sql += ' AND a.dentist_id=?'; params.push(actor.dentist_id); }
  else if (filters.dentist_id) { sql += ' AND a.dentist_id=?'; params.push(id(filters.dentist_id)); }
  return db.prepare(sql + ' ORDER BY a.date,a.start_time,a.id').all(...params);
}
export function appointmentDetail(db, actor, appointmentId) {
  authorized(actor);
  const appointment = found(db.prepare(appointmentSelect + ' WHERE a.id=?').get(id(appointmentId)));
  if (actor.role === 'odontologo' && appointment.dentist_id !== actor.dentist_id) throw new AppError('Solo puedes consultar tus propios turnos.', 403);
  const changes = db.prepare(`SELECT c.*,u.name AS user_name FROM appointment_changes c JOIN users u ON u.id=c.user_id
    WHERE appointment_id=? ORDER BY c.id DESC`).all(appointment.id);
  const visit = actor.role === 'odontologo' ? db.prepare('SELECT * FROM clinical_visits WHERE appointment_id=?').get(appointment.id) : null;
  return { appointment, changes, visit };
}
export function createAppointment(db, actor, input, now = localNow()) {
  authorized(actor, 'recepcionista');
  const data = { patient_id: id(input.patient_id), dentist_id: id(input.dentist_id), branch_id: id(input.branch_id),
    date: input.date, start_time: input.start_time, end_time: input.end_time, reason: required(input.reason, 'Motivo', 300) };
  return db.transaction(() => {
    found(db.prepare('SELECT id FROM patients WHERE id=?').get(data.patient_id));
    validateSlot(db, data, null, now);
    return { id: Number(db.prepare(`INSERT INTO appointments(patient_id,dentist_id,branch_id,date,start_time,end_time,reason,created_by)
      VALUES (@patient_id,@dentist_id,@branch_id,@date,@start_time,@end_time,@reason,@created_by)`).run({ ...data, created_by: actor.id }).lastInsertRowid) };
  }).immediate();
}
export function rescheduleAppointment(db, actor, appointmentId, input, now = localNow()) {
  authorized(actor, 'recepcionista');
  return db.transaction(() => {
    const a = appointmentDetail(db, actor, appointmentId).appointment;
    if (a.status !== 'programado') throw new AppError('Solo se pueden reprogramar turnos programados.');
    const data = { ...a, date: input.date, start_time: input.start_time, end_time: input.end_time };
    validateSlot(db, data, a.id, now);
    if (a.date === data.date && a.start_time === data.start_time && a.end_time === data.end_time) throw new AppError('Selecciona una fecha u horario diferente.');
    db.prepare('UPDATE appointments SET date=?,start_time=?,end_time=? WHERE id=?').run(data.date, data.start_time, data.end_time, a.id);
    db.prepare(`INSERT INTO appointment_changes(appointment_id,old_date,old_start,old_end,new_date,new_start,new_end,user_id)
      VALUES (?,?,?,?,?,?,?,?)`).run(a.id, a.date, a.start_time, a.end_time, data.date, data.start_time, data.end_time, actor.id);
    return { id: a.id };
  }).immediate();
}
export function changeStatus(db, actor, appointmentId, status, now = localNow()) {
  authorized(actor, 'recepcionista');
  if (!['cancelado', 'ausente'].includes(status)) throw new AppError('Estado no permitido.');
  return db.transaction(() => {
    const a = appointmentDetail(db, actor, appointmentId).appointment;
    if (a.status !== 'programado') throw new AppError('Solo se puede cambiar un turno programado.');
    if (status === 'ausente' && `${a.date} ${a.end_time}` > `${now.date} ${now.time}`) throw new AppError('Solo puedes registrar una inasistencia cuando el turno haya finalizado.');
    db.prepare('UPDATE appointments SET status=? WHERE id=?').run(status, a.id);
    return { id: a.id };
  }).immediate();
}
export function recordVisit(db, actor, appointmentId, input, now = localNow()) {
  authorized(actor, 'odontologo');
  const treatment = required(input.treatment, 'Tratamiento realizado', 5000);
  const nextDate = input.next_date || null;
  const nextProcedure = input.next_procedure ? required(input.next_procedure, 'Próximo procedimiento', 1000) : null;
  if (nextDate && (!validDate(nextDate) || nextDate < now.date)) throw new AppError('La fecha de seguimiento debe ser hoy o posterior.');
  return db.transaction(() => {
    const a = appointmentDetail(db, actor, appointmentId).appointment;
    if (a.status !== 'programado') throw new AppError('Este turno ya fue atendido, cancelado o marcado ausente.');
    if (`${a.date} ${a.start_time}` > `${now.date} ${now.time}`) throw new AppError('Espera al inicio del turno para registrar la atención.');
    db.prepare('INSERT INTO clinical_visits(appointment_id,patient_id,dentist_id,treatment,next_date,next_procedure) VALUES (?,?,?,?,?,?)').run(a.id, a.patient_id, actor.dentist_id, treatment, nextDate, nextProcedure);
    db.prepare("UPDATE appointments SET status='atendido' WHERE id=?").run(a.id);
    return { id: a.id };
  }).immediate();
}
export function availableSlots(db, actor, filters, now = localNow()) {
  authorized(actor);
  const dentistId = actor.role === 'odontologo' ? actor.dentist_id : id(filters.dentist_id);
  const branchId = id(filters.branch_id), date = filters.date;
  const duration = Number(filters.duration || 30);
  if (!validDate(date) || !Number.isInteger(duration) || duration < 5 || duration > 720) throw new AppError('Selecciona fecha y duración (5 a 720 minutos).');
  if (!db.prepare('SELECT 1 FROM dentists WHERE id=? AND active=1').get(dentistId)) return [];
  const blocks = db.prepare('SELECT * FROM availabilities WHERE dentist_id=? AND branch_id=? AND weekday=?').all(dentistId, branchId, weekday(date));
  const exclude = filters.exclude_id ? id(filters.exclude_id) : 0;
  if (exclude) appointmentDetail(db, actor, exclude);
  const occupied = db.prepare("SELECT * FROM appointments WHERE dentist_id=? AND date=? AND status!='cancelado' AND id!=?").all(dentistId, date, exclude);
  const slots = [];
  for (const block of blocks) for (let start = minute(block.start_time); start + duration <= minute(block.end_time); start += 15) {
    const start_time = clock(start), end_time = clock(start + duration);
    if (`${date} ${start_time}` > `${now.date} ${now.time}` && !occupied.some(a => a.start_time < end_time && a.end_time > start_time)) slots.push({ start_time, end_time });
  }
  return slots;
}
export function createUser(db, input) {
  const name = required(input.name, 'Nombre', 120), email = required(input.email, 'Correo', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Correo inválido.');
  if (!['recepcionista', 'odontologo'].includes(input.role)) throw new AppError('Rol inválido.');
  const dentistId = input.role === 'odontologo' ? id(input.dentist_id) : null;
  if (dentistId) found(db.prepare('SELECT id FROM dentists WHERE id=?').get(dentistId));
  const hash = hashPassword(input.password);
  return Number(db.prepare('INSERT INTO users(name,email,password_hash,role,dentist_id) VALUES (?,?,?,?,?)').run(name, email, hash, input.role, dentistId).lastInsertRowid);
}
export function publicError(error) {
  if (error instanceof AppError) return { error: error.message, status: error.status };
  if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_BUSY_SNAPSHOT') return { error: 'La base de datos está ocupada. Intenta guardar otra vez en unos segundos.', status: 503 };
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { error: 'El registro ya existe. Revisa la cédula, el correo o la atención del turno.', status: 409 };
  if (error.code?.startsWith('SQLITE_CONSTRAINT')) return { error: 'Los datos no cumplen las relaciones o restricciones de la base.', status: 400 };
  return { error: 'No se pudo completar la operación. Intenta nuevamente.', status: 500 };
}
