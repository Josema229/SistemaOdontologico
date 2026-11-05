import Link from 'next/link';
import { database, requireUser } from '../../../lib/server.js';
import { listPatients } from '../../../lib/services.js';
import { PageTitle, Icon, Empty } from '../../../components/ui.jsx';
export default async function Patients({ searchParams }) {
  const user = await requireUser(); const { q = '' } = await searchParams;
  const patients = listPatients(database(), user, q);
  return <><PageTitle eyebrow="Personas que cuidamos" title="Pacientes" description={user.role === 'recepcionista' ? 'Un registro compartido entre las tres sucursales.' : 'Pacientes asignados o con un turno no cancelado contigo.'}>{user.role === 'recepcionista' && <Link href="/pacientes/nuevo" className="btn"><Icon name="plus"/>Registrar paciente</Link>}</PageTitle>
    <form className="panel mb-6 flex flex-wrap items-end gap-3 p-5"><label className="max-w-xl flex-1">Buscar paciente<input name="q" defaultValue={q} placeholder="Nombre, apellido o cédula" maxLength={100}/></label><button type="submit" className="btn-light"><Icon name="search"/>Buscar</button>{q && <Link href="/pacientes" className="btn-light">Limpiar</Link>}</form>
    <section className="panel overflow-hidden"><div className="border-b border-[#e5e1d7] px-5 py-5 font-semibold">{patients.length} paciente{patients.length === 1 ? '' : 's'}</div>{patients.length ? <div className="overflow-x-auto"><table><thead><tr><th>Paciente</th><th>Cédula</th><th>Teléfono</th><th>Profesional asignado</th><th/></tr></thead><tbody>{patients.map(p => <tr key={p.id}><td><Link href={`/pacientes/${p.id}`} className="font-semibold hover:text-brand">{p.first_name} {p.last_name}</Link></td><td>{p.identity_number}</td><td>{p.phone || 'Sin teléfono'}</td><td>{p.dentist_name || 'Sin asignar'}</td><td><Link href={`/pacientes/${p.id}`} className="text-xs font-semibold text-brand">Ver ficha →</Link></td></tr>)}</tbody></table></div> : <Empty title={q ? 'No encontramos coincidencias' : 'Sin pacientes para mostrar'} text={q ? 'Prueba con otro nombre, apellido o cédula.' : 'Los pacientes registrados y autorizados aparecerán aquí.'}/>}</section></>;
}
