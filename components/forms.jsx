'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export async function requestApi(url, body, method = 'POST') {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data;
  try { data = await response.json(); } catch { throw new Error('El servidor no respondió. Intenta nuevamente.'); }
  if (!response.ok) throw new Error(data.error || 'No se pudo guardar.');
  return data;
}
export function ApiForm({ url, method = 'POST', redirectTo, children, submit = 'Guardar cambios', cancelHref, transform, className = '' }) {
  const router = useRouter();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  async function send(event) {
    event.preventDefault(); setError(''); setPending(true);
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await requestApi(url, transform ? transform(values) : values, method);
      router.push(redirectTo?.replace(':id', result.id) || '/'); router.refresh();
    } catch (err) { setError(err.message); } finally { setPending(false); }
  }
  return <form onSubmit={send} className={className} aria-busy={pending}>
    <fieldset disabled={pending} className="min-w-0 space-y-6">{children}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3 border-t border-[#e5e1d7] pt-5">{cancelHref && <Link href={cancelHref} className="btn-light">Volver</Link>}<button type="submit" className="btn">{pending ? 'Guardando…' : submit}</button></div>
    </fieldset>
  </form>;
}
export function LoginForm() { return <ApiForm url="/api/login" redirectTo="/" submit="Iniciar sesión"><label>Correo electrónico<input type="email" name="email" autoComplete="username" placeholder="nombre@dentalcare.local" required maxLength={254}/></label><label>Contraseña<input type="password" name="password" autoComplete="current-password" required maxLength={256}/></label></ApiForm>; }
export function ActionButton({ url, body, label, confirmation, redirectTo, danger = false, method = 'POST' }) {
  const router = useRouter(); const [pending, setPending] = useState(false), [error, setError] = useState('');
  async function run() {
    if (confirmation && !window.confirm(confirmation)) return;
    setPending(true); setError('');
    try { await requestApi(url, body, method); if (redirectTo) router.push(redirectTo); router.refresh(); }
    catch (err) { setError(err.message); } finally { setPending(false); }
  }
  return <div><button type="button" onClick={run} disabled={pending} className={danger ? 'btn-danger' : 'btn-light'}>{pending ? 'Procesando…' : label}</button>{error && <p role="alert" className="mt-2 max-w-sm text-sm text-red-700">{error}</p>}</div>;
}
export function PatientForm({ patient = {}, dentists }) {
  return <ApiForm url={`/api/patients${patient.id ? '/' + patient.id : ''}`} method={patient.id ? 'PUT' : 'POST'} redirectTo="/pacientes/:id" submit={patient.id ? 'Guardar paciente' : 'Registrar paciente'} cancelHref={patient.id ? `/pacientes/${patient.id}` : '/pacientes'}>
    <div className="field-grid"><label>Nombre<input name="first_name" defaultValue={patient.first_name} required maxLength={80}/></label><label>Apellido<input name="last_name" defaultValue={patient.last_name} required maxLength={80}/></label><label>Cédula<input name="identity_number" defaultValue={patient.identity_number} required maxLength={40} inputMode="numeric"/><span className="mt-1 block text-xs font-normal text-muted">Puedes escribirla con puntos o espacios.</span></label><label>Teléfono (opcional)<input name="phone" defaultValue={patient.phone} maxLength={40} type="tel"/></label></div>
    <label>Odontólogo asignado<select name="dentist_id" defaultValue={patient.dentist_id || ''}><option value="">Sin asignar</option>{dentists.filter(d => d.active || d.id === patient.dentist_id).map(d => <option key={d.id} value={d.id}>{d.name}{d.active ? '' : ' (inactivo; selecciona otro profesional)'}</option>)}</select></label>
    <p className="muted">La asignación facilita el seguimiento. Cambiarla conserva todas las atenciones anteriores.</p>
  </ApiForm>;
}
export function AppointmentForm({ patients = [], dentists = [], branches = [], appointment, initialPatient = '', today }) {
  const [dentist, setDentist] = useState(String(appointment?.dentist_id || ''));
  const [branch, setBranch] = useState(String(appointment?.branch_id || ''));
  const [date, setDate] = useState(appointment?.date || today);
  const [start, setStart] = useState(appointment?.start_time || '08:00');
  const [end, setEnd] = useState(appointment?.end_time || '08:30');
  const [duration, setDuration] = useState('30');
  const [slots, setSlots] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const reset = () => { setSlots(null); setError(''); };
  async function findSlots() {
    setLoading(true); setError(''); setSlots(null);
    try {
      const params = new URLSearchParams({ dentist_id: dentist, branch_id: branch, date, duration, ...(appointment ? { exclude_id: appointment.id } : {}) });
      const response = await fetch('/api/availability?' + params);
      const data = await response.json(); if (!response.ok) throw new Error(data.error); setSlots(data);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  function setDefaultEnd(time) {
    setStart(time);
    const [h, m] = time.split(':').map(Number); const total = h * 60 + m + Number(duration);
    if (total <= 1200) setEnd(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
  }
  return <ApiForm url={appointment ? `/api/appointments/${appointment.id}/reschedule` : '/api/appointments'} redirectTo="/turnos/:id" submit={appointment ? 'Confirmar reprogramación' : 'Agendar turno'} cancelHref={appointment ? `/turnos/${appointment.id}` : '/agenda'}>
    {!appointment && <><label>Paciente<select name="patient_id" defaultValue={initialPatient} required><option value="">Selecciona un paciente</option>{patients.map(p => <option value={p.id} key={p.id}>{p.last_name}, {p.first_name} · CI {p.identity_number}</option>)}</select></label><div className="field-grid"><label>Odontólogo<select name="dentist_id" value={dentist} onChange={e => { setDentist(e.target.value); reset(); }} required><option value="">Selecciona un profesional</option>{dentists.filter(d => d.active).map(d => <option value={d.id} key={d.id}>{d.name} · {d.specialty}</option>)}</select></label><label>Sucursal<select name="branch_id" value={branch} onChange={e => { setBranch(e.target.value); reset(); }} required><option value="">Selecciona una sucursal</option>{branches.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label></div></>}
    {appointment && <div className="rounded-xl bg-[#edf0e5] p-4"><p className="font-semibold">{appointment.patient_name}</p><p className="muted mt-1">{appointment.dentist_name} · {appointment.branch_name}</p><p className="muted mt-2">Se conservan paciente, profesional y sucursal.</p></div>}
    <div className="field-grid"><label>Fecha<input name="date" type="date" value={date} onChange={e => { setDate(e.target.value); reset(); }} min={today} required/></label><label>Duración para consultar disponibilidad<select value={duration} onChange={e => { setDuration(e.target.value); reset(); }}><option value="15">15 minutos</option><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option><option value="90">90 minutos</option><option value="120">120 minutos</option></select></label></div>
    <div className="rounded-xl border border-[#e5e1d7] bg-[#f8f7f0] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Horarios disponibles</p><p className="mt-1 text-xs text-muted">Sugerencias cada 15 minutos. También puedes ajustar las horas.</p></div><button type="button" onClick={findSlots} disabled={!dentist || !branch || !date || loading} className="btn-light">{loading ? 'Consultando…' : 'Consultar disponibilidad'}</button></div>{error && <p role="alert" className="mt-3 text-red-700">{error}</p>}{slots && <div className="mt-4 flex max-h-48 flex-wrap gap-2 overflow-y-auto">{slots.length ? slots.map(s => <button key={s.start_time} type="button" className={`rounded-lg border px-3 py-2 text-xs ${s.start_time === start && s.end_time === end ? 'border-brand bg-brand text-white' : 'border-[#d8d9cb] bg-white text-brand'}`} onClick={() => { setStart(s.start_time); setEnd(s.end_time); }}>{s.start_time} – {s.end_time}</button>) : <p className="muted">No hay horarios libres para esta selección.</p>}</div>}</div>
    <div className="field-grid"><label>Hora inicial<input type="time" name="start_time" min="08:00" max="19:59" value={start} onChange={e => setDefaultEnd(e.target.value)} required/></label><label>Hora final<input type="time" name="end_time" min="08:01" max="20:00" value={end} onChange={e => setEnd(e.target.value)} required/></label></div>
    {!appointment && <label>Tratamiento o motivo<input name="reason" placeholder="Ej.: control de ortodoncia" maxLength={300} required/></label>}
    <p className="muted">Horario de la clínica: 08:00 a 20:00 · America/Asuncion. La disponibilidad se comprueba otra vez al guardar.</p>
  </ApiForm>;
}
export function VisitForm({ appointment, today }) { return <ApiForm url={`/api/appointments/${appointment.id}/visit`} redirectTo={`/turnos/${appointment.id}`} submit="Guardar atención" cancelHref={`/turnos/${appointment.id}`}><label>Tratamiento realizado<textarea name="treatment" rows={5} maxLength={5000} placeholder="Describe el procedimiento y las indicaciones de esta atención." required/></label><div className="field-grid"><label>Próxima atención prevista (opcional)<input type="date" name="next_date" min={today}/></label><label>Procedimiento previsto (opcional)<input name="next_procedure" maxLength={1000}/></label></div><p className="rounded-lg bg-[#f2f0e6] p-4 text-sm text-muted">El seguimiento es una referencia y no reserva un turno. Al guardar, el turno se marcará como atendido.</p></ApiForm>; }
