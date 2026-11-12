import { loadEnvFile } from 'node:process';
import { openDatabase, one, transaction } from '../lib/db.js';
import { createUser, createAppointment, recordVisit, changeStatus } from '../lib/services.js';
import { localNow } from '../lib/time.js';
import { dataTables } from '../lib/data-tables.js';

try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (process.env.NODE_ENV === 'production') throw new Error('Los datos de demostración están deshabilitados en producción.');
const db = openDatabase();
try {
  await transaction(db, async client => {
    if (process.argv.includes('--reset')) {
      if (process.env.NODE_ENV !== 'development') throw new Error('--reset requiere NODE_ENV=development explícito.');
      await client.query(`TRUNCATE ${dataTables.map(table => `"${table}"`).join(',')} RESTART IDENTITY`);
    }
    if (await one(client, 'SELECT 1 FROM users WHERE email=$1', ['recepcion@dentalcare.local'])) {
      console.log('La demostración ya existe.');
      return;
    }
    if (await one(client, 'SELECT 1 FROM dentists LIMIT 1') || await one(client, 'SELECT 1 FROM patients LIMIT 1')) {
      throw new Error('Existen datos propios. Utiliza una base vacía para la demostración.');
    }
    const branchIds = [];
    for (const name of ['Presidente Franco', 'Ciudad del Este', 'Hernandarias']) {
      await client.query('INSERT INTO branches(name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
      branchIds.push((await one(client, 'SELECT id FROM branches WHERE name=$1', [name])).id);
    }
    const specialtyIds = [];
    for (const name of ['Ortodoncia', 'Odontología clínica', 'Odontopediatría']) {
      await client.query('INSERT INTO specialties(name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
      specialtyIds.push((await one(client, 'SELECT id FROM specialties WHERE name=$1', [name])).id);
    }
    const names = ['Dra. Lucía Benítez', 'Dr. Martín Rojas', 'Dra. Camila Duarte'];
    const dentistIds = [];
    for (let index = 0; index < names.length; index++) {
      const dentist = await one(client, 'INSERT INTO dentists(name,specialty_id) VALUES ($1,$2) RETURNING id', [names[index], specialtyIds[index]]);
      dentistIds.push(dentist.id);
      for (const branch of branchIds) await client.query('INSERT INTO dentist_branches VALUES ($1,$2)', [dentist.id, branch]);
      for (let day = 0; day < 7; day++) {
        await client.query('INSERT INTO availabilities(dentist_id,branch_id,weekday,start_time,end_time) VALUES ($1,$2,$3,$4,$5)', [dentist.id, branchIds[index], day, '08:00', '16:00']);
        await client.query('INSERT INTO availabilities(dentist_id,branch_id,weekday,start_time,end_time) VALUES ($1,$2,$3,$4,$5)', [dentist.id, branchIds[(index + 1) % 3], day, '16:00', '20:00']);
      }
    }
    const receptionId = await createUser(client, { name: 'Ana López', email: 'recepcion@dentalcare.local', password: 'DentalDemo2026!', role: 'recepcionista' });
    const reception = await one(client, 'SELECT * FROM users WHERE id=$1', [receptionId]);
    for (let index = 0; index < dentistIds.length; index++) {
      await createUser(client, { name: names[index], email: ['lucia', 'martin', 'camila'][index] + '@dentalcare.local', password: 'DentalDemo2026!', role: 'odontologo', dentist_id: dentistIds[index] });
    }
    const people = [['Sofía', 'González', '5234011'], ['Mateo', 'Fernández', '4192832'], ['Valentina', 'López', '6281033'], ['Diego', 'Martínez', '3921404'], ['Isabella', 'Vera', '7102035'], ['Gabriel', 'Acosta', '5032816'], ['Emma', 'Torres', '6219037'], ['Lucas', 'Ramírez', '4520918']];
    const patientIds = [];
    for (let index = 0; index < people.length; index++) {
      const patient = await one(client, 'INSERT INTO patients(first_name,last_name,identity_number,phone,dentist_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [...people[index], `0981 555 ${100 + index}`, dentistIds[index % 3]]);
      patientIds.push(patient.id);
    }
    const today = localNow().date;
    const shift = days => {
      const date = new Date(today + 'T12:00:00Z');
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const before = { date: shift(-60), time: '00:00' };
    for (let index = 0; index < 8; index++) {
      const dentist = index % 3;
      await createAppointment(client, reception, { patient_id: patientIds[index], dentist_id: dentistIds[dentist], branch_id: branchIds[dentist], date: today, start_time: `${String(8 + index).padStart(2, '0')}:00`, end_time: `${String(8 + index).padStart(2, '0')}:30`, reason: 'Consulta de demostración' }, before);
    }
    for (let index = 0; index < 5; index++) {
      const dentist = index % 3;
      const date = shift(-index - 1);
      const appointment = await createAppointment(client, reception, { patient_id: patientIds[index], dentist_id: dentistIds[dentist], branch_id: branchIds[dentist], date, start_time: '09:00', end_time: '09:30', reason: 'Consulta de demostración' }, before);
      if (index < 3) {
        const doctor = await one(client, 'SELECT * FROM users WHERE dentist_id=$1', [dentistIds[dentist]]);
        await recordVisit(client, doctor, appointment.id, { treatment: 'Control de demostración. Evolución favorable.', next_date: shift(7), next_procedure: 'Control' }, { date, time: '10:00' });
        await client.query('UPDATE clinical_visits SET attended_at=$1 WHERE appointment_id=$2', [date + 'T13:00:00Z', appointment.id]);
      } else {
        await changeStatus(client, reception, appointment.id, index === 3 ? 'cancelado' : 'ausente', { date: today, time: '20:00' });
      }
    }
    for (let index = 0; index < 3; index++) {
      await createAppointment(client, reception, { patient_id: patientIds[index], dentist_id: dentistIds[index], branch_id: branchIds[index], date: shift(1), start_time: '10:00', end_time: '10:30', reason: 'Control de seguimiento' }, before);
    }
    console.log('Demostración creada: 3 profesionales, 8 pacientes y 16 turnos.');
  });
} finally {
  await db.end();
}