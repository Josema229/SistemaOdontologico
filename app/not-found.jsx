import Link from 'next/link';
export default function NotFound() { return <main className="p-10"><h1 className="mb-3 text-2xl font-bold">Registro no disponible</h1><p className="muted mb-6">El registro no existe o tu cuenta no tiene acceso.</p><Link href="/" className="btn">Volver al inicio</Link></main>; }
