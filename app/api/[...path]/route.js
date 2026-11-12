import { cookies } from 'next/headers';
import { database, currentUser } from '../../../lib/server.js';
import { login, logout, checkOrigin, AppError } from '../../../lib/security.js';
import * as service from '../../../lib/services.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function handle(request, context) {
  try {
    const { path } = await context.params;
    const [resource, recordId, action] = path;
    const db = database();
    const method = request.method;
    if (method !== 'GET') checkOrigin(request);
    let input = {};
    if (method === 'POST' || method === 'PUT') {
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('Se requiere JSON.', 415);
      const raw = await request.text();
      if (raw.length > 100000) throw new AppError('Formulario demasiado grande.', 413);
      try { input = JSON.parse(raw); } catch { throw new AppError('JSON inválido.'); }
      if (!input || Array.isArray(input) || typeof input !== 'object') throw new AppError('Formulario inválido.');
    }
    const jar = await cookies();
    if (resource === 'login' && path.length === 1 && method === 'POST') {
      const token = await login(db, input.email, input.password);
      const secure = process.env.COOKIE_SECURE === 'true' || process.env.APP_ORIGIN?.startsWith('https://');
      jar.set('dentalcare_session', token, { httpOnly: true, sameSite: 'lax', secure: Boolean(secure), path: '/', maxAge: 8 * 3600 });
      return json({ ok: true });
    }
    const actor = await currentUser();
    service.authorized(actor);
    if (resource === 'logout' && path.length === 1 && method === 'POST') {
      await logout(db, jar.get('dentalcare_session')?.value);
      jar.delete('dentalcare_session');
      return json({ ok: true });
    }
    const filters = Object.fromEntries(new URL(request.url).searchParams);
    if (resource === 'patients') {
      if (method === 'GET') return json(recordId ? (await service.patientDetail(db, actor, recordId)) : (await service.listPatients(db, actor, filters.q)));
      if (method === 'POST' && !recordId) return json((await service.savePatient(db, actor, input)), 201);
      if (method === 'PUT' && recordId) return json((await service.savePatient(db, actor, input, recordId)));
      if (method === 'DELETE' && recordId) return json((await service.deletePatient(db, actor, recordId)));
    }
    if (resource === 'dentists') {
      if (method === 'GET') return json((await service.dentistsWithAvailability(db, actor)));
      if (method === 'POST' && !recordId) return json((await service.saveDentist(db, actor, input)), 201);
      if (method === 'PUT' && recordId) return json((await service.saveDentist(db, actor, input, recordId)));
    }
    if (resource === 'availability' && method === 'GET') return json((await service.availableSlots(db, actor, filters)));
    if (resource === 'appointments') {
      if (method === 'GET') return json(recordId ? (await service.appointmentDetail(db, actor, recordId)) : (await service.listAppointments(db, actor, filters)));
      if (method === 'POST' && !recordId) return json((await service.createAppointment(db, actor, input)), 201);
      if (method === 'POST' && recordId && action === 'reschedule') return json((await service.rescheduleAppointment(db, actor, recordId, input)));
      if (method === 'POST' && recordId && action === 'status') return json((await service.changeStatus(db, actor, recordId, input.status)));
      if (method === 'POST' && recordId && action === 'visit') return json((await service.recordVisit(db, actor, recordId, input)));
    }
    throw new AppError('Operación no encontrada.', 404);
  } catch (error) {
    const result = service.publicError(error);
    if (result.status === 500) console.error('DentalCare:', error);
    return json({ error: result.error }, result.status);
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
