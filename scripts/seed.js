import { loadEnvFile } from 'node:process';
import { openDatabase } from '../lib/db.js';
import { createUser, createAppointment, recordVisit, changeStatus } from '../lib/services.js';
import { localNow } from '../lib/time.js';
try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (process.env.NODE_ENV === 'production') throw new Error('Los datos de demostración están deshabilitados en producción.');
const db = openDatabase();
try {
  if (process.argv.includes('--reset')) {
    if (process.env.NODE_ENV !== 'development') throw new Error('--reset requiere NODE_ENV=development explícito.');
    db.transaction(() => {
      for (const table of ['clinical_visits', 'appointment_changes', 'appointments', 'patients', 'sessions', 'login_attempts', 'users', 'availabilities', 'dentist_branches', 'dentists', 'specialties', 'branches']) db.exec(`DELETE FROM ${table}`);
    }).immediate();
  }
  db.transaction(() => {
    ['Presidente Franco', 'Ciudad del Este', 'Hernandarias'].forEach(name => db.prepare('INSERT OR IGNORE INTO branches(name) VALUES (?)').run(name));
    ['Ortodoncia', 'Odontología clínica', 'Odontopediatría'].forEach(name => db.prepare('INSERT OR IGNORE INTO specialties(name) VALUES (?)').run(name));
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get('recepcion@dentalcare.local')) {
      console.log('La demostración ya existe. No se modificaron sus registros.'); return;
    }
    if (db.prepare('SELECT 1 FROM dentists LIMIT 1').get() || db.prepare('SELECT 1 FROM patients LIMIT 1').get()) throw new Error('Existen datos propios. Para evitar mezclarlos, utiliza una base vacía para la demostración.');
    const branchIds = ['Presidente Franco', 'Ciudad del Este', 'Hernandarias'].map(n => db.prepare('SELECT id FROM branches WHERE name=?').get(n).id);
    const names = ['Dra. Lucía Benítez', 'Dr. Martín Rojas', 'Dra. Camila Duarte'];
    const dentistIds = names.map((name, index) => {
      const specialty = db.prepare('SELECT id FROM specialties WHERE name=?').get(['Ortodoncia', 'Odontología clínica', 'Odontopediatría'][index]).id;
      const dentistId = Number(db.prepare('INSERT INTO dentists(name,specialty_id) VALUES (?,?)').run(name, specialty).lastInsertRowid);
      for (const branch of branchIds) db.prepare('INSERT INTO dentist_branches VALUES (?,?)').run(dentistId, branch);
      for (let day = 0; day < 7; day++) {
        db.prepare('INSERT INTO availabilities(dentist_id,branch_id,weekday,start_time,end_time) VALUES (?,?,?,?,?)').run(dentistId, branchIds[index], day, '08:00', '16:00');
        db.prepare('INSERT INTO availabilities(dentist_id,branch_id,weekday,start_time,end_time) VALUES (?,?,?,?,?)').run(dentistId, branchIds[(index + 1) % 3], day, '16:00', '20:00');
      }
      return dentistId;
    });
    const receptionId = createUser(db, { name: 'Ana López', email: 'recepcion@dentalcare.local', password: 'DentalDemo2026!', role: 'recepcionista' });
    const reception = db.prepare('SELECT * FROM users WHERE id=?').get(receptionId);
    dentistIds.forEach((dentist, i) => createUser(db, { name: names[i], email: ['lucia', 'martin', 'camila'][i] + '@dentalcare.local', password: 'DentalDemo2026!', role: 'odontologo', dentist_id: dentist }));
    const patientIds = [['Sofía', 'González', '5234011'], ['Mateo', 'Fernández', '4192832'], ['Valentina', 'López', '6281033'], ['Diego', 'Martínez', '3921404'], ['Isabella', 'Vera', '7102035'], ['Gabriel', 'Acosta', '5032816'], ['Emma', 'Torres', '6219037'], ['Lucas', 'Ramírez', '4520918']].map((p, i) => Number(db.prepare('INSERT INTO patients(first_name,last_name,identity_number,phone,dentist_id) VALUES (?,?,?,?,?)').run(...p, `0981 555 ${String(100 + i)}`, dentistIds[i % 3]).lastInsertRowid));
    const today = localNow().date;
    const shift = days => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
    const before = { date: shift(-60), time: '00:00' };
    // Los servicios validan los datos; el reloj explícito permite construir el historial ficticio.
    for (let i = 0; i < 8; i++) {
      const dentist = i % 3;
      createAppointment(db, reception, { patient_id: patientIds[i], dentist_id: dentistIds[dentist], branch_id: branchIds[dentist], date: today, start_time: `${String(8 + i).padStart(2, '0')}:00`, end_time: `${String(8 + i).padStart(2, '0')}:30`, reason: ['Control de ortodoncia', 'Consulta general', 'Control pediátrico'][dentist] }, before);
    }
    for (let i = 0; i < 5; i++) {
      const dentist = i % 3, date = shift(-i - 1);
      const a = createAppointment(db, reception, { patient_id: patientIds[i], dentist_id: dentistIds[dentist], branch_id: branchIds[dentist], date, start_time: '09:00', end_time: '09:30', reason: 'Consulta de demostración' }, before);
      if (i < 3) {
        const doctor = db.prepare('SELECT * FROM users WHERE dentist_id=?').get(dentistIds[dentist]);
        recordVisit(db, doctor, a.id, { treatment: ['Control y ajuste de aparatología. Evolución favorable.', 'Limpieza y evaluación clínica. Indicaciones de higiene.', 'Control preventivo. Educación sobre cepillado.'][i], next_date: shift(7), next_procedure: 'Control de seguimiento' }, { date, time: '10:00' });
        db.prepare('UPDATE clinical_visits SET attended_at=? WHERE appointment_id=?').run(date + ' 13:00:00', a.id);
      } else changeStatus(db, reception, a.id, i === 3 ? 'cancelado' : 'ausente', { date: today, time: '20:00' });
    }
    for (let i = 0; i < 3; i++) createAppointment(db, reception, { patient_id: patientIds[i], dentist_id: dentistIds[i], branch_id: branchIds[i], date: shift(1), start_time: '10:00', end_time: '10:30', reason: 'Control de seguimiento' }, before);
    console.log('Demostración creada: 3 profesionales, 8 pacientes y 16 turnos. Credenciales en README.md.');
  }).immediate();
} finally { db.close(); }
