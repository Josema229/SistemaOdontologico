import { requireUser } from '../../lib/server.js';
import { Brand, Icon } from '../../components/ui.jsx';
import Navigation from '../../components/navigation.jsx';
import { ActionButton } from '../../components/forms.jsx';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export default async function PrivateLayout({ children }) {
  const user = await requireUser(); const reception = user.role === 'recepcionista';
  return <div className="min-h-screen md:flex">
    <aside className="border-b border-[#e1e9e7] bg-white p-4 md:fixed md:inset-y-0 md:w-60 md:border-r md:p-6">
      <Link href="/" className="mb-5 block md:mb-12"><Brand/></Link><p className="eyebrow mb-3 hidden px-4 md:block">Espacio de trabajo</p><Navigation reception={reception}/>
      <div className="absolute bottom-6 left-6 right-6 hidden rounded-xl border border-[#dfeae6] bg-[#f7faf9] p-4 md:block"><div className="mb-2 flex items-center gap-2 text-brand"><Icon name="pin" className="h-4 w-4"/><span className="text-xs font-semibold">Una red, tres sucursales</span></div><p className="text-xs leading-5 text-muted">Presidente Franco<br/>Ciudad del Este<br/>Hernandarias</p><p className="mt-4 border-t border-[#e1eae6] pt-3 text-[11px] text-muted">America/Asuncion · 08:00–20:00</p></div>
    </aside>
    <div className="min-w-0 flex-1 md:ml-60"><header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-[#e1e9e7] bg-white px-5 py-4 lg:px-10"><div className="flex items-center gap-2 text-xs text-muted"><span className="h-2 w-2 rounded-full bg-[#5eaa8e]"/>Sistema interno<span className="mx-2 text-[#d7e3df]">/</span>DentalCare</div><div className="flex items-center gap-4"><div className="hidden h-9 w-9 items-center justify-center rounded-full bg-[#e9f2ee] text-xs font-bold text-brand sm:flex">{user.name.split(' ').slice(0, 2).map(n => n[0]).join('')}</div><div><p className="text-sm font-semibold">{user.name}</p><p className="mt-0.5 text-xs capitalize text-muted">{reception ? 'Recepcionista' : 'Odontólogo'}</p></div><ActionButton url="/api/logout" body={{}} label="Salir" redirectTo="/login"/></div></header>
      <main className="mx-auto max-w-[1500px] px-5 py-8 lg:px-10 lg:py-10">{children}</main>
      <footer className="px-5 pb-6 text-xs text-[#8a9c9c] lg:px-10">DentalCare · Gestión interna de consultorios</footer>
    </div>
  </div>;
}
