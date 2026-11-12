import { database, requireUser } from '../../../../lib/server.js';
import { referenceData, listPatients } from '../../../../lib/services.js';
import { localNow } from '../../../../lib/time.js';
import { PageTitle } from '../../../../components/ui.jsx';
import { AppointmentForm } from '../../../../components/forms.jsx';
export default async function NewAppointment({ searchParams }) {
  const user = await requireUser('recepcionista'), db = database(); const { patient_id } = await searchParams;
  return <><PageTitle eyebrow="Agenda" title="Nuevo turno" description="Elige al paciente y consulta la disponibilidad del profesional."/><div className="panel max-w-4xl p-6 sm:p-8"><AppointmentForm {...(await referenceData(db, user))} patients={(await listPatients(db, user))} initialPatient={patient_id} today={localNow().date}/></div></>;
}
