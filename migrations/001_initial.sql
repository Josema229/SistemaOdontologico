CREATE TABLE branches (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE specialties (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE dentists (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, specialty_id INTEGER NOT NULL REFERENCES specialties(id),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE users (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('recepcionista','odontologo')),
 dentist_id INTEGER UNIQUE REFERENCES dentists(id),
 CHECK((role='odontologo' AND dentist_id IS NOT NULL) OR (role='recepcionista' AND dentist_id IS NULL))
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE dentist_branches (
 dentist_id INTEGER NOT NULL REFERENCES dentists(id), branch_id INTEGER NOT NULL REFERENCES branches(id),
 PRIMARY KEY(dentist_id,branch_id)
);
CREATE TABLE availabilities (
 id INTEGER PRIMARY KEY, dentist_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 start_time TEXT NOT NULL, end_time TEXT NOT NULL,
 CHECK(start_time >= '08:00' AND end_time <= '20:00' AND start_time < end_time),
 FOREIGN KEY(dentist_id,branch_id) REFERENCES dentist_branches(dentist_id,branch_id)
);
CREATE INDEX availability_lookup ON availabilities(dentist_id,weekday);
CREATE TABLE patients (
 id INTEGER PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
 identity_number TEXT NOT NULL UNIQUE, phone TEXT NOT NULL DEFAULT '',
 dentist_id INTEGER REFERENCES dentists(id), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX patients_names ON patients(last_name,first_name);
CREATE TABLE appointments (
 id INTEGER PRIMARY KEY, patient_id INTEGER NOT NULL REFERENCES patients(id),
 dentist_id INTEGER NOT NULL, branch_id INTEGER NOT NULL,
 date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'programado' CHECK(status IN ('programado','atendido','cancelado','ausente')),
 created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(start_time >= '08:00' AND end_time <= '20:00' AND start_time < end_time),
 FOREIGN KEY(dentist_id,branch_id) REFERENCES dentist_branches(dentist_id,branch_id)
);
CREATE INDEX appointment_schedule ON appointments(dentist_id,date,start_time,end_time,status);
CREATE INDEX appointment_patient ON appointments(patient_id);
CREATE INDEX appointment_branch ON appointments(branch_id,date);
CREATE TABLE appointment_changes (
 id INTEGER PRIMARY KEY, appointment_id INTEGER NOT NULL REFERENCES appointments(id),
 old_date TEXT NOT NULL, old_start TEXT NOT NULL, old_end TEXT NOT NULL,
 new_date TEXT NOT NULL, new_start TEXT NOT NULL, new_end TEXT NOT NULL,
 user_id INTEGER NOT NULL REFERENCES users(id), changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE clinical_visits (
 id INTEGER PRIMARY KEY, appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id),
 patient_id INTEGER NOT NULL REFERENCES patients(id), dentist_id INTEGER NOT NULL REFERENCES dentists(id),
 attended_at TEXT NOT NULL DEFAULT (datetime('now')), treatment TEXT NOT NULL,
 next_date TEXT, next_procedure TEXT
);
CREATE INDEX clinical_patient ON clinical_visits(patient_id,attended_at);
CREATE TABLE login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
