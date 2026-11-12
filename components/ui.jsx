import Link from 'next/link';
const STATES = { programado: 'Programado', atendido: 'Atendido', cancelado: 'Cancelado', ausente: 'Ausente' };

export function Icon({ name = 'calendar', className = 'h-5 w-5' }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2M8 18h2"/></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5v1"/></>,
    tooth: <path d="M12 5c-3-3-8-3-8 2 0 4 2 5 2 8s1 6 3 6c1 0 1-7 3-7s2 7 3 7c2 0 3-3 3-6s2-4 2-8c0-5-5-5-8-2Zm0 0 3 2"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <path d="m9 5 7 7-7 7"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    exit: <><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    smile: <><circle cx="12" cy="12" r="9"/><path d="M8 14c1.5 3 6.5 3 8 0M8.5 9h.01M15.5 9h.01"/></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.calendar}</svg>;
}
export function Brand() { return <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-white"><Icon name="tooth" className="h-7 w-7"/></div><div><span className="text-xl font-semibold tracking-tight">DentalCare</span><p className="text-[10px] tracking-[.08em] text-muted">Tu consultorio, más cerca</p></div></div>; }
export function PageTitle({ eyebrow, title, description, children }) { return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>{description && <p className="muted mt-2">{description}</p>}</div>{children}</div>; }
export function Badge({ status }) {
  const colors = { programado: 'bg-[#eee9f5] text-[#65527e]', atendido: 'bg-[#e9efdf] text-[#4c663c]', cancelado: 'bg-[#efede7] text-[#716d64]', ausente: 'bg-[#f8e9d8] text-[#8a6033]' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colors[status] || ''}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{STATES[status] || status}</span>;
}
export function Empty({ title = 'Todavía no hay registros', text = 'Los registros aparecerán aquí cuando los agregues.', children }) { return <div className="px-6 py-14 text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf0e5] text-brand"><Icon/></div><h3 className="font-semibold">{title}</h3><p className="muted mx-auto mt-2 max-w-md">{text}</p>{children && <div className="mt-5">{children}</div>}</div>; }
export function AppointmentTable({ appointments, showDate = false }) {
  if (!appointments.length) return <Empty title="La agenda está libre" text="No hay turnos para esta selección. Prueba otra fecha o registra un nuevo turno."/>;
  return <div className="overflow-x-auto"><table><thead><tr>{showDate && <th>Fecha</th>}<th>Horario</th><th>Paciente</th><th>Odontólogo / sucursal</th><th>Motivo</th><th>Estado</th><th><span className="sr-only">Detalle</span></th></tr></thead><tbody>{appointments.map(a => <tr key={a.id}>{showDate && <td>{formatDate(a.date)}</td>}<td><span className="font-semibold">{a.start_time}</span><span className="mt-1 block text-xs text-muted">hasta {a.end_time}</span></td><td><Link href={`/pacientes/${a.patient_id}`} className="font-semibold hover:text-brand">{a.patient_name}</Link><span className="mt-1 block text-xs text-muted">Turno #{String(a.id).padStart(3, '0')}</span></td><td>{a.dentist_name}<span className="mt-1 block text-xs text-muted">{a.branch_name}</span></td><td className="max-w-48 truncate" title={a.reason}>{a.reason}</td><td><Badge status={a.status}/></td><td><Link href={`/turnos/${a.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand">Ver turno<Icon name="arrow" className="h-4 w-4"/></Link></td></tr>)}</tbody></table></div>;
}
export function formatDate(date) { return new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date + 'T12:00:00Z')); }
export function formatInstant(value) {
  let instant = value;
  if (!(value instanceof Date)) {
    const timestamp = value.replace(' ', 'T');
    instant = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? timestamp : timestamp + 'Z');
  }
  return new Intl.DateTimeFormat('es-PY', {
    timeZone: 'America/Asuncion', dateStyle: 'medium', timeStyle: 'short',
  }).format(instant);
}
