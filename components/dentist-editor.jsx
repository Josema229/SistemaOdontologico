'use client';
import { useState } from 'react';
import { ApiForm } from './forms.jsx';
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function DentistEditor({ dentist = {}, branches, specialties }) {
  const [selected, setSelected] = useState(dentist.branches || []);
  const [blocks, setBlocks] = useState(dentist.availability || []);
  const [active, setActive] = useState(dentist.active !== 0);
  function update(index, key, value) { setBlocks(blocks.map((b, i) => i === index ? { ...b, [key]: value } : b)); }
  return <ApiForm url={`/api/dentists${dentist.id ? '/' + dentist.id : ''}`} method={dentist.id ? 'PUT' : 'POST'} redirectTo="/odontologos" cancelHref="/odontologos" submit="Guardar profesional y disponibilidad" transform={values => ({ ...values, branches: selected, active, availability: blocks })}>
    <div className="field-grid"><label>Nombre del profesional<input name="name" defaultValue={dentist.name} maxLength={120} required/></label><label>Especialidad<select name="specialty_id" defaultValue={dentist.specialty_id || ''} required><option value="">Selecciona una especialidad</option>{specialties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
    <label className="flex items-center gap-3"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/>Profesional activo</label>
    <div><p className="mb-3 text-sm font-semibold">Sucursales asignadas</p><div className="flex flex-wrap gap-4">{branches.map(b => <label className="flex items-center gap-2 font-normal" key={b.id}><input type="checkbox" checked={selected.includes(b.id)} onChange={e => setSelected(e.target.checked ? [...selected, b.id] : selected.filter(s => s !== b.id))}/>{b.name}</label>)}</div></div>
    <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Disponibilidad semanal</h2><p className="muted mt-1">Un bloque por día y sucursal. No deben superponerse.</p></div><button type="button" className="btn-light" disabled={!selected.length} onClick={() => setBlocks([...blocks, { branch_id: selected[0], weekday: 1, start_time: '08:00', end_time: '12:00' }])}>+ Agregar bloque</button></div>
      {!blocks.length && <p className="rounded-lg bg-[#f4f2ea] p-4 text-muted">Sin bloques. No se podrán agendar nuevos turnos hasta agregar disponibilidad.</p>}
      {blocks.map((b, index) => <div key={index} className="grid gap-3 rounded-xl border border-[#e5e1d7] p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1fr_1fr_auto]">
        <label>Día<select value={b.weekday} onChange={e => update(index, 'weekday', Number(e.target.value))}>{days.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
        <label>Sucursal<select value={b.branch_id} onChange={e => update(index, 'branch_id', Number(e.target.value))}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Desde<input type="time" value={b.start_time} min="08:00" max="19:59" onChange={e => update(index, 'start_time', e.target.value)} required/></label><label>Hasta<input type="time" value={b.end_time} min="08:01" max="20:00" onChange={e => update(index, 'end_time', e.target.value)} required/></label>
        <button type="button" onClick={() => setBlocks(blocks.filter((_, i) => i !== index))} className="self-end rounded-lg p-3 text-sm text-red-700 hover:bg-red-50" aria-label={`Quitar bloque ${index + 1}`}>Quitar</button>
      </div>)}
    </div>
    <p className="rounded-lg bg-[#fff8eb] p-4 text-sm text-[#8e713c]">Si el cambio afecta turnos futuros, el sistema lo rechazará e indicará los conflictos. Primero resuelve esos turnos desde la agenda. Los registros históricos se conservan.</p>
  </ApiForm>;
}
