import { notFound } from 'next/navigation';
import { database, requireUser } from '../../../../../lib/server.js';
import { patientDetail, referenceData } from '../../../../../lib/services.js';
import { PageTitle } from '../../../../../components/ui.jsx';
import { PatientForm } from '../../../../../components/forms.jsx';
export default async function EditPatient({ params }) {
  const user = await requireUser('recepcionista'), db = database(); const { id } = await params;
  let patient; try { patient = patientDetail(db, user, id).patient; } catch (e) { if (e.status) notFound(); throw e; }
  return <><PageTitle eyebrow="Pacientes" title="Actualizar ficha" description={`${patient.first_name} ${patient.last_name}`}/><div className="panel max-w-3xl p-6 sm:p-8"><PatientForm patient={patient} dentists={referenceData(db, user).dentists}/></div></>;
}
