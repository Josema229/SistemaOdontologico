'use client';
export default function ErrorPage({ reset }) { return <div className="panel m-6 max-w-lg space-y-4 p-8"><h1 className="text-xl font-bold">No pudimos cargar esta página</h1><p className="muted">Intenta nuevamente. Si el problema continúa, consulta al responsable del sistema.</p><button onClick={reset} className="btn">Reintentar</button></div>; }
