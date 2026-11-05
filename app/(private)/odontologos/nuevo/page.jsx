import { database, requireUser } from '../../../../lib/server.js';
import { referenceData } from '../../../../lib/services.js';
import { PageTitle } from '../../../../components/ui.jsx';
import DentistEditor from '../../../../components/dentist-editor.jsx';
export default async function NewDentist() { const user = await requireUser('recepcionista'); const refs = referenceData(database(), user); return <><PageTitle eyebrow="Equipo" title="Agregar profesional" description="Define su especialidad y los horarios en los que atenderá."/><div className="panel max-w-5xl p-6 sm:p-8"><DentistEditor branches={refs.branches} specialties={refs.specialties}/></div></>; }
