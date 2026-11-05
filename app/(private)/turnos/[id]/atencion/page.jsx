import { notFound, redirect } from 'next/navigation';
import { database, requireUser } from '../../../../../lib/server.js';
import { appointmentDetail } from '../../../../../lib/services.js';
import { localNow } from '../../../../../lib/time.js';
import { PageTitle, formatDate } from '../../../../../components/ui.jsx';
import { VisitForm } from '../../../../../components/forms.jsx';
export default async function Attend({ params }) {
  const user = await requireUser('odontologo'), { id } = await params;
  let appointment; try { appointment = appointmentDetail(database(), user, id).appointment; } catch (e) { if (e.status) notFound(); throw e; }
  if (appointment.status !== 'programado') redirect(`/turnos/${id}`);
  return <><PageTitle eyebrow={`Atención · Turno #${id}`} title="Registrar atención" description={`${appointment.patient_name} · ${formatDate(appointment.date)} · ${appointment.start_time}`}/><div className="panel max-w-4xl p-6 sm:p-8"><VisitForm appointment={appointment} today={localNow().date}/></div></>;
}
