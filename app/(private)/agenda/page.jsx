import Link from 'next/link';
import { database, requireUser } from '../../../lib/server.js';
import { listAppointments, referenceData } from '../../../lib/services.js';
import { localNow } from '../../../lib/time.js';
import { PageTitle, Icon, AppointmentTable } from '../../../components/ui.jsx';

export default async function Agenda({ searchParams }) {
  const user = await requireUser(), db = database(), params = await searchParams;
  const filters = { ...params, date: params.date || localNow().date };
  const refs = referenceData(db, user);
  let appointments = [], error;
  try { appointments = listAppointments(db, user, filters); } catch (e) { error = e.message; }
  return <><PageTitle eyebrow="Organización diaria" title="Agenda" description="Consulta los turnos y encuentra el próximo espacio disponible.">{user.role === 'recepcionista' && <Link href="/turnos/nuevo" className="btn"><Icon name="plus"/>Nuevo turno</Link>}</PageTitle>
    <form className="panel mb-6 grid items-end gap-4 p-5 sm:grid-cols-2 xl:grid-cols-[1fr_1.2fr_1.4fr_auto]"><label>Fecha<input type="date" name="date" defaultValue={filters.date} required/></label><label>Sucursal<select name="branch_id" defaultValue={filters.branch_id || ''}><option value="">Todas las sucursales</option>{refs.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>{user.role === 'recepcionista' ? <label>Odontólogo<select name="dentist_id" defaultValue={filters.dentist_id || ''}><option value="">Todos los profesionales</option>{refs.dentists.map(d => <option key={d.id} value={d.id}>{d.name}{d.active ? '' : ' (inactivo)'}</option>)}</select></label> : <p className="muted pb-3">Mostrando únicamente tus turnos.</p>}<button className="btn-light" type="submit">Consultar agenda</button></form>
    {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
    <section className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e1d7] px-5 py-5"><h2 className="font-semibold">Turnos del día <span className="ml-2 rounded-md bg-[#edf0e5] px-2 py-1 text-xs text-brand">{appointments.length}</span></h2><p className="text-xs text-muted">08:00–20:00 · America/Asuncion</p></div><AppointmentTable appointments={appointments}/></section>
  </>;
}
