import 'server-only';
import { openDatabase } from './db.js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionUser } from './security.js';

const globalDb = globalThis;
export function database() { return globalDb.dentalcareDb ||= openDatabase(); }
export async function currentUser() { return sessionUser(database(), (await cookies()).get('dentalcare_session')?.value); }
export async function requireUser(role) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (role && user.role !== role) redirect('/');
  return user;
}
