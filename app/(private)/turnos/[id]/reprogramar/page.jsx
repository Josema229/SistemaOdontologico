import { notFound, redirect } from 'next/navigation';
import { database, requireUser } from '../../../../../lib/server.js';
import { appointmentDetail } from '../../../../../lib/services.js';
import { localNow } from '../../../../../lib/time.js';
import { PageTitle } from '../../../../../components/ui.jsx';
import { AppointmentForm } from '../../../../../components/forms.jsx';
export default async function Reschedule({ params }) {
  const user = await requireUser('recepcionista'), { id } = await params;
  let appointment; try { appointment = appointmentDetail(database(), user, id).appointment; } catch (e) { if (e.status) notFound(); throw e; }
  if (appointment.status !== 'programado') redirect(`/turnos/${id}`);
  return <><PageTitle eyebrow={`Agenda · Turno #${id}`} title="Reprogramar turno" description="Si el nuevo horario no está disponible, el turno original se conservará."/><div className="panel max-w-4xl p-6 sm:p-8"><AppointmentForm appointment={appointment} today={localNow().date}/></div></>;
}
