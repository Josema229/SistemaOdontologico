import { notFound } from 'next/navigation';
import { database, requireUser } from '../../../../lib/server.js';
import { dentistsWithAvailability, referenceData } from '../../../../lib/services.js';
import { PageTitle } from '../../../../components/ui.jsx';
import DentistEditor from '../../../../components/dentist-editor.jsx';
export default async function EditDentist({ params }) {
  const user = await requireUser('recepcionista'), db = database(), { id } = await params;
  const dentist = dentistsWithAvailability(db, user).find(d => d.id === Number(id)); if (!dentist) notFound();
  const refs = referenceData(db, user);
  return <><PageTitle eyebrow="Equipo y disponibilidad" title={dentist.name} description="Los cambios se validan frente a los turnos programados."/><div className="panel max-w-5xl p-6 sm:p-8"><DentistEditor dentist={dentist} branches={refs.branches} specialties={refs.specialties}/></div></>;
}
