'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './ui.jsx';

export default function Navigation({ reception }) {
  const pathname = usePathname();
  const items = [['/', 'Inicio', 'home'], ['/agenda', 'Agenda', 'calendar'], ['/pacientes', 'Pacientes', 'people'], ...(reception ? [['/odontologos', 'Odontólogos', 'tooth']] : [])];
  return <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-2" aria-label="Navegación principal">{items.map(([href, label, icon]) => {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return <Link href={href} key={href} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-medium ${active ? 'bg-[#e8edda] text-brand' : 'text-muted hover:bg-[#f0eee4]'}`}><Icon name={icon}/>{label}{active && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-brand md:block"/>}</Link>;
  })}</nav>;
}
