import Link from 'next/link';
import { database, requireUser } from '../../lib/server.js';
import { listAppointments } from '../../lib/services.js';
import { localNow } from '../../lib/time.js';
import { PageTitle, Icon, AppointmentTable, formatDate } from '../../components/ui.jsx';

export default async function Dashboard() {
  const user = await requireUser(); const today = localNow();
  const appointments = listAppointments(database(), user, { date: today.date });
  const metrics = [ ['Turnos del día', appointments.length, 'calendar', 'bg-[#e9f1fc] text-[#6185ac]'], ['Programados', appointments.filter(a => a.status === 'programado').length, 'clock', 'bg-[#eaf4ef] text-[#5a9a80]'], ['Atendidos', appointments.filter(a => a.status === 'atendido').length, 'check', 'bg-[#f0edf9] text-[#8c7db3]'], ['Ausentes', appointments.filter(a => a.status === 'ausente').length, 'people', 'bg-[#fdf2df] text-[#b49a65]'] ];
  const next = appointments.find(a => a.status === 'programado' && a.start_time > today.time);
  return <>
    <PageTitle eyebrow="Tu consultorio, en orden" title={`Hola, ${user.name.split(' ')[0]}`} description={`Este es el resumen de ${user.role === 'odontologo' ? 'tu agenda' : 'la agenda'} de hoy, ${formatDate(today.date)}.`}>{user.role === 'recepcionista' && <Link href="/turnos/nuevo" className="btn"><Icon name="plus"/>Nuevo turno</Link>}</PageTitle>
    <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">{metrics.map(([label, value, icon, color]) => <div className="panel flex items-start justify-between p-5 lg:p-6" key={label}><div><p className="text-xs font-medium text-muted">{label}</p><p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-2 text-[11px] text-muted">{formatDate(today.date)}</p></div><div className={`rounded-xl p-2.5 ${color}`}><Icon name={icon}/></div></div>)}</div>
    <div className="mb-7 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Agenda de hoy</h2><p className="muted mt-1">{user.role === 'odontologo' ? 'Tus pacientes y próximas atenciones.' : 'Todos los profesionales y sucursales.'}</p></div><Link href="/agenda" className="flex items-center gap-2 text-sm font-semibold text-brand">Abrir agenda<Icon name="arrow" className="h-4 w-4"/></Link></div>
    <section className="panel overflow-hidden" aria-label="Agenda de hoy"><AppointmentTable appointments={appointments}/></section>
    <div className="mt-6 grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-[#dbe8e2] bg-[#edf5f1] p-6"><div className="mb-3 flex items-center gap-2 text-brand"><Icon name="clock"/><h2 className="font-semibold">Próximo turno</h2></div>{next ? <Link href={`/turnos/${next.id}`} className="block"><p className="text-lg font-semibold">{next.start_time} · {next.patient_name}</p><p className="muted mt-2">{next.dentist_name} · {next.branch_name}</p></Link> : <p className="muted">No quedan turnos próximos para hoy.</p>}</div><div className="panel p-6"><h2 className="mb-2 font-semibold">Información a mano</h2><p className="muted">{user.role === 'recepcionista' ? 'Consulta pacientes de todas las sucursales y mantén sus datos actualizados.' : 'Consulta el historial de tus pacientes autorizados antes de registrar una atención.'}</p><Link href="/pacientes" className="mt-4 inline-flex items-center gap-2 font-semibold text-brand">Ir a pacientes<Icon name="arrow" className="h-4 w-4"/></Link></div></div>
  </>;
}
