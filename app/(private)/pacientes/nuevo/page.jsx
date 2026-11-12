import { database, requireUser } from '../../../../lib/server.js';
import { referenceData } from '../../../../lib/services.js';
import { PageTitle } from '../../../../components/ui.jsx';
import { PatientForm } from '../../../../components/forms.jsx';
export default async function NewPatient() { const user = await requireUser('recepcionista'); return <><PageTitle eyebrow="Pacientes" title="Registrar paciente" description="Completa los datos básicos para crear la ficha."/><div className="panel max-w-3xl p-6 sm:p-8"><PatientForm dentists={(await referenceData(database(), user)).dentists}/></div></>; }
