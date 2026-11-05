import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/server.js';
import { Brand, Icon } from '../../components/ui.jsx';
import { LoginForm } from '../../components/forms.jsx';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await currentUser()) redirect('/');
  return <main className="flex min-h-screen">
    <section className="login-story hidden w-[45%] flex-col justify-between p-10 text-ink lg:flex xl:p-14">
      <Brand/>
      <div className="py-10">
        <div className="mb-9 flex h-24 w-24 items-center justify-center rounded-full border border-[#d6c3a8] bg-[#f9f2e3] text-[#87644a]"><Icon name="smile" className="h-14 w-14"/></div>
        <p className="eyebrow mb-5">Cuidar empieza por organizar</p>
        <h1 className="max-w-md text-5xl leading-tight font-semibold tracking-tight">Más tiempo para<br/>cada sonrisa.</h1>
        <p className="mt-6 max-w-sm text-base leading-7 text-[#686553]">Un espacio tranquilo para organizar tu día y acompañar a cada paciente.</p>
        <div className="mt-10 flex items-center gap-3 text-sm text-[#686553]"><span className="rounded-2xl border border-[#d6c3a8] p-3"><Icon name="calendar"/></span>Tres sucursales. Un equipo conectado.</div>
      </div>
      <p className="text-xs text-[#686553]">Presidente Franco · Ciudad del Este · Hernandarias</p>
    </section>
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-12 lg:hidden"><Brand/></div>
        <p className="eyebrow mb-3">Qué bueno tenerte por aquí</p>
        <h2 className="text-3xl font-semibold tracking-tight">Bienvenido a tu día</h2>
        <p className="muted mb-8 mt-3">Ingresa para ver tu agenda y empezar con calma.</p>
        <LoginForm/>
        <p className="muted mt-8 border-t border-line pt-6 text-xs">Acceso para recepción y odontólogos.<br/>Si necesitas una cuenta, contacta al responsable del consultorio.</p>
      </div>
    </section>
  </main>;
}