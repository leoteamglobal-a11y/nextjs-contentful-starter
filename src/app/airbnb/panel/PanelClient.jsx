'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useCollection } from './useStore.js';
import { estimateMonthly, reservationIncome, formatMoney } from '../lib/finance.js';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'propiedades', label: 'Propiedades', icon: '🏠' },
  { key: 'reservas', label: 'Reservas', icon: '📅' },
  { key: 'duenos', label: 'Dueños', icon: '👤' },
];

export default function PanelClient() {
  const [tab, setTab] = useState('dashboard');
  const owners = useCollection('owners');
  const properties = useCollection('properties');
  const reservations = useCollection('reservations');

  return (
    <div className="min-h-screen text-gray-900 bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="flex items-center justify-between max-w-6xl px-6 py-4 mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/airbnb" className="text-lg font-extrabold text-rose-600">CoHost<span className="text-gray-900">Pro</span></Link>
            <span className="px-2 py-0.5 text-xs font-semibold text-gray-500 bg-gray-100 rounded">Panel</span>
          </div>
          <Link href="/airbnb" className="text-sm text-gray-500 hover:text-rose-600">← Volver al sitio</Link>
        </div>
        <nav className="flex gap-1 max-w-6xl px-4 mx-auto -mb-px overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                tab === t.key ? 'border-rose-600 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl px-6 py-8 mx-auto">
        {tab === 'dashboard' && <Dashboard owners={owners} properties={properties} reservations={reservations} setTab={setTab} />}
        {tab === 'propiedades' && <Properties properties={properties} owners={owners} />}
        {tab === 'reservas' && <Reservations reservations={reservations} properties={properties} />}
        {tab === 'duenos' && <Owners owners={owners} properties={properties} />}
      </main>
    </div>
  );
}

/* ----------------------------- Dashboard ----------------------------- */

function Dashboard({ owners, properties, reservations, setTab }) {
  const stats = useMemo(() => {
    const activeProps = properties.items.filter((p) => p.status !== 'inactiva');

    // Comisión proyectada mensual según parámetros de cada propiedad activa.
    const projectedMonthly = activeProps.reduce((sum, p) => {
      const est = estimateMonthly({
        nightlyRate: Number(p.nightlyRate),
        occupancy: Number(p.occupancy),
        commissionPct: Number(p.commissionPct),
        monthlyCosts: Number(p.monthlyCosts),
      });
      return sum + est.yourCommission;
    }, 0);

    // Ingresos reales según reservas registradas.
    let grossReal = 0;
    let commissionReal = 0;
    for (const r of reservations.items) {
      if (r.status === 'cancelada') continue;
      const prop = properties.items.find((p) => p.id === r.propertyId);
      const commissionPct = r.commissionPct ?? prop?.commissionPct ?? 0;
      const { gross, commission } = reservationIncome({
        nights: Number(r.nights),
        nightlyRate: Number(r.nightlyRate),
        commissionPct: Number(commissionPct),
        extraFees: Number(r.extraFees),
      });
      grossReal += gross;
      commissionReal += commission;
    }

    return {
      owners: owners.items.length,
      activeProps: activeProps.length,
      totalProps: properties.items.length,
      projectedMonthly,
      grossReal,
      commissionReal,
      reservations: reservations.items.filter((r) => r.status !== 'cancelada').length,
    };
  }, [owners.items, properties.items, reservations.items]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return reservations.items
      .filter((r) => r.status !== 'cancelada' && r.checkIn && r.checkIn >= today)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
      .slice(0, 5)
      .map((r) => ({ ...r, propName: properties.items.find((p) => p.id === r.propertyId)?.name || '—' }));
  }, [reservations.items, properties.items]);

  const empty = owners.items.length === 0 && properties.items.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Resumen del negocio</h1>
        <p className="text-gray-500">Todo se guarda en este navegador. Registra dueños, propiedades y reservas para ver tus números.</p>
      </div>

      {empty && (
        <div className="p-8 text-center border-2 border-dashed border-rose-200 rounded-2xl bg-rose-50">
          <div className="mb-3 text-4xl">🚀</div>
          <h3 className="text-lg font-bold">Empieza tu operación</h3>
          <p className="mt-1 mb-4 text-gray-600">Agrega tu primer dueño y su propiedad para arrancar el CRM.</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => setTab('duenos')} className={btnPrimary}>+ Agregar dueño</button>
            <button onClick={() => setTab('propiedades')} className={btnGhost}>+ Agregar propiedad</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Comisión ganada (real)" value={formatMoney(stats.commissionReal)} tone="rose" hint="De reservas registradas" />
        <StatCard label="Comisión proyectada / mes" value={formatMoney(stats.projectedMonthly)} tone="dark" hint="Según propiedades activas" />
        <StatCard label="Ingreso bruto gestionado" value={formatMoney(stats.grossReal)} hint="Total de reservas" />
        <StatCard label="Propiedades activas" value={`${stats.activeProps}/${stats.totalProps}`} hint={`${stats.owners} dueño(s)`} />
      </div>

      <div className="p-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
        <h3 className="mb-4 font-bold">Próximos check-ins</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400">No hay reservas futuras registradas.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{r.guest || 'Huésped'}</p>
                  <p className="text-sm text-gray-500">{r.propName}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-rose-600">{r.checkIn}</p>
                  <p className="text-xs text-gray-400">{r.nights} noche(s)</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint, tone }) {
  const toneCls =
    tone === 'rose' ? 'bg-rose-600 text-white' : tone === 'dark' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-100';
  const hintCls = tone ? 'text-white/70' : 'text-gray-400';
  return (
    <div className={`p-5 shadow-sm rounded-2xl ${toneCls}`}>
      <p className={`text-sm ${tone ? 'text-white/80' : 'text-gray-500'}`}>{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      {hint && <p className={`mt-1 text-xs ${hintCls}`}>{hint}</p>}
    </div>
  );
}

/* ----------------------------- Dueños ----------------------------- */

function Owners({ owners, properties }) {
  const [form, setForm] = useState(null); // null | {} | owner

  function save(data) {
    if (data.id) owners.update(data.id, data);
    else owners.add(data);
    setForm(null);
  }

  return (
    <Section
      title="Dueños"
      subtitle="Los propietarios cuyas propiedades administras."
      action={<button onClick={() => setForm({})} className={btnPrimary}>+ Nuevo dueño</button>}
    >
      {owners.items.length === 0 ? (
        <Empty text="Aún no hay dueños. Agrega el primero." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {owners.items.map((o) => {
            const count = properties.items.filter((p) => p.ownerId === o.id).length;
            return (
              <Card key={o.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold">{o.name}</h3>
                    <p className="text-sm text-gray-500">{o.contact}</p>
                  </div>
                  <span className="px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded">{count} prop.</span>
                </div>
                {o.notes && <p className="mt-3 text-sm text-gray-600">{o.notes}</p>}
                <RowActions onEdit={() => setForm(o)} onDelete={() => confirmDelete(`al dueño ${o.name}`) && owners.remove(o.id)} />
              </Card>
            );
          })}
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Editar dueño' : 'Nuevo dueño'} onClose={() => setForm(null)}>
          <OwnerForm initial={form} onSave={save} onCancel={() => setForm(null)} />
        </Modal>
      )}
    </Section>
  );
}

function OwnerForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ name: '', contact: '', notes: '', ...initial });
  const up = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) onSave(f); }} className="space-y-4">
      <FormField label="Nombre *"><input required value={f.name} onChange={up('name')} className={inputCls} /></FormField>
      <FormField label="Contacto (tel/email)"><input value={f.contact} onChange={up('contact')} className={inputCls} /></FormField>
      <FormField label="Notas"><textarea rows={3} value={f.notes} onChange={up('notes')} className={inputCls} /></FormField>
      <FormButtons onCancel={onCancel} />
    </form>
  );
}

/* ----------------------------- Propiedades ----------------------------- */

function Properties({ properties, owners }) {
  const [form, setForm] = useState(null);

  function save(data) {
    if (data.id) properties.update(data.id, data);
    else properties.add(data);
    setForm(null);
  }

  return (
    <Section
      title="Propiedades"
      subtitle="Cada propiedad que administras, con su tarifa, ocupación y tu comisión."
      action={<button onClick={() => setForm({})} className={btnPrimary}>+ Nueva propiedad</button>}
    >
      {properties.items.length === 0 ? (
        <Empty text="Sin propiedades todavía. Agrega una para proyectar tus ingresos." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {properties.items.map((p) => {
            const owner = owners.items.find((o) => o.id === p.ownerId);
            const est = estimateMonthly({
              nightlyRate: Number(p.nightlyRate),
              occupancy: Number(p.occupancy),
              commissionPct: Number(p.commissionPct),
              monthlyCosts: Number(p.monthlyCosts),
            });
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold">{p.name}</h3>
                      {p.status === 'inactiva' && <span className="px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded">inactiva</span>}
                    </div>
                    <p className="text-sm text-gray-500">{p.city}{owner ? ` · ${owner.name}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-rose-600">{formatMoney(est.yourCommission)}</p>
                    <p className="text-xs text-gray-400">tu comisión/mes</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <MiniStat label="Tarifa/noche" value={formatMoney(p.nightlyRate)} />
                  <MiniStat label="Ocupación" value={`${p.occupancy || 0}%`} />
                  <MiniStat label="Comisión" value={`${p.commissionPct || 0}%`} />
                </div>
                <RowActions onEdit={() => setForm(p)} onDelete={() => confirmDelete(`la propiedad ${p.name}`) && properties.remove(p.id)} />
              </Card>
            );
          })}
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Editar propiedad' : 'Nueva propiedad'} onClose={() => setForm(null)}>
          <PropertyForm initial={form} owners={owners.items} onSave={save} onCancel={() => setForm(null)} />
        </Modal>
      )}
    </Section>
  );
}

function PropertyForm({ initial, owners, onSave, onCancel }) {
  const [f, setF] = useState({
    name: '', ownerId: '', city: '', nightlyRate: 80, occupancy: 65, commissionPct: 20, monthlyCosts: 0, status: 'activa', ...initial,
  });
  const up = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) onSave(f); }} className="space-y-4">
      <FormField label="Nombre de la propiedad *"><input required value={f.name} onChange={up('name')} className={inputCls} placeholder="Depto Centro 2R" /></FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Dueño">
          <select value={f.ownerId} onChange={up('ownerId')} className={inputCls}>
            <option value="">— Sin asignar —</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </FormField>
        <FormField label="Ciudad"><input value={f.city} onChange={up('city')} className={inputCls} /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Tarifa por noche"><input type="number" min={0} value={f.nightlyRate} onChange={up('nightlyRate')} className={inputCls} /></FormField>
        <FormField label="Ocupación (%)"><input type="number" min={0} max={100} value={f.occupancy} onChange={up('occupancy')} className={inputCls} /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Tu comisión (%)"><input type="number" min={0} max={100} value={f.commissionPct} onChange={up('commissionPct')} className={inputCls} /></FormField>
        <FormField label="Costos mensuales"><input type="number" min={0} value={f.monthlyCosts} onChange={up('monthlyCosts')} className={inputCls} /></FormField>
      </div>
      <FormField label="Estado">
        <select value={f.status} onChange={up('status')} className={inputCls}>
          <option value="activa">Activa</option>
          <option value="inactiva">Inactiva</option>
        </select>
      </FormField>
      <FormButtons onCancel={onCancel} />
    </form>
  );
}

/* ----------------------------- Reservas ----------------------------- */

function Reservations({ reservations, properties }) {
  const [form, setForm] = useState(null);

  function save(data) {
    const nights = computeNights(data.checkIn, data.checkOut) || Number(data.nights) || 0;
    const payload = { ...data, nights };
    if (data.id) reservations.update(data.id, payload);
    else reservations.add(payload);
    setForm(null);
  }

  const sorted = [...reservations.items].sort((a, b) => (b.checkIn || '').localeCompare(a.checkIn || ''));

  return (
    <Section
      title="Reservas"
      subtitle="Registra cada reserva para llevar el control de tus comisiones ganadas."
      action={<button onClick={() => setForm({})} className={btnPrimary}>+ Nueva reserva</button>}
    >
      {sorted.length === 0 ? (
        <Empty text="Sin reservas registradas." />
      ) : (
        <div className="overflow-x-auto bg-white border border-gray-100 shadow-sm rounded-2xl">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b border-gray-100 bg-gray-50">
              <tr>
                <Th>Huésped</Th><Th>Propiedad</Th><Th>Check-in</Th><Th>Noches</Th><Th>Bruto</Th><Th>Comisión</Th><Th>Estado</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((r) => {
                const prop = properties.items.find((p) => p.id === r.propertyId);
                const pct = r.commissionPct ?? prop?.commissionPct ?? 0;
                const { gross, commission } = reservationIncome({
                  nights: Number(r.nights), nightlyRate: Number(r.nightlyRate), commissionPct: Number(pct), extraFees: Number(r.extraFees),
                });
                return (
                  <tr key={r.id} className={r.status === 'cancelada' ? 'opacity-50' : ''}>
                    <Td className="font-medium">{r.guest || '—'}</Td>
                    <Td>{prop?.name || '—'}</Td>
                    <Td>{r.checkIn || '—'}</Td>
                    <Td>{r.nights}</Td>
                    <Td>{formatMoney(gross)}</Td>
                    <Td className="font-semibold text-rose-600">{formatMoney(commission)}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td>
                      <div className="flex gap-2">
                        <button onClick={() => setForm(r)} className="text-gray-400 hover:text-rose-600">✏️</button>
                        <button onClick={() => confirmDelete('esta reserva') && reservations.remove(r.id)} className="text-gray-400 hover:text-red-600">🗑️</button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Editar reserva' : 'Nueva reserva'} onClose={() => setForm(null)}>
          <ReservationForm initial={form} properties={properties.items} onSave={save} onCancel={() => setForm(null)} />
        </Modal>
      )}
    </Section>
  );
}

function ReservationForm({ initial, properties, onSave, onCancel }) {
  const [f, setF] = useState({
    guest: '', propertyId: '', checkIn: '', checkOut: '', nightlyRate: 80, extraFees: 0, commissionPct: '', status: 'confirmada', nights: 0, ...initial,
  });
  const up = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  // Al elegir propiedad, hereda su tarifa y comisión por defecto.
  function onPickProperty(e) {
    const id = e.target.value;
    const prop = properties.find((p) => p.id === id);
    setF((s) => ({
      ...s,
      propertyId: id,
      nightlyRate: prop?.nightlyRate ?? s.nightlyRate,
      commissionPct: prop?.commissionPct ?? s.commissionPct,
    }));
  }

  const nights = computeNights(f.checkIn, f.checkOut);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className="space-y-4">
      <FormField label="Huésped"><input value={f.guest} onChange={up('guest')} className={inputCls} placeholder="Nombre del huésped" /></FormField>
      <FormField label="Propiedad *">
        <select required value={f.propertyId} onChange={onPickProperty} className={inputCls}>
          <option value="">— Selecciona —</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Check-in"><input type="date" value={f.checkIn} onChange={up('checkIn')} className={inputCls} /></FormField>
        <FormField label="Check-out"><input type="date" value={f.checkOut} onChange={up('checkOut')} className={inputCls} /></FormField>
      </div>
      {nights > 0 && <p className="text-sm text-gray-500">Duración: <b>{nights}</b> noche(s)</p>}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Tarifa por noche"><input type="number" min={0} value={f.nightlyRate} onChange={up('nightlyRate')} className={inputCls} /></FormField>
        <FormField label="Cargos extra"><input type="number" min={0} value={f.extraFees} onChange={up('extraFees')} className={inputCls} /></FormField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Comisión (%)"><input type="number" min={0} max={100} value={f.commissionPct} onChange={up('commissionPct')} className={inputCls} placeholder="hereda de la propiedad" /></FormField>
        <FormField label="Estado">
          <select value={f.status} onChange={up('status')} className={inputCls}>
            <option value="confirmada">Confirmada</option>
            <option value="completada">Completada</option>
            <option value="pendiente">Pendiente</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </FormField>
      </div>
      <FormButtons onCancel={onCancel} />
    </form>
  );
}

/* ----------------------------- UI compartida ----------------------------- */

function Section({ title, subtitle, action, children }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-gray-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Card({ children }) {
  return <div className="p-5 bg-white border border-gray-100 shadow-sm rounded-2xl">{children}</div>;
}

function MiniStat({ label, value }) {
  return (
    <div className="p-2 rounded-lg bg-gray-50">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex gap-4 pt-4 mt-4 text-sm border-t border-gray-100">
      <button onClick={onEdit} className="text-gray-500 hover:text-rose-600">Editar</button>
      <button onClick={onDelete} className="text-gray-500 hover:text-red-600">Eliminar</button>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    confirmada: 'bg-blue-100 text-blue-700',
    completada: 'bg-green-100 text-green-700',
    pendiente: 'bg-amber-100 text-amber-700',
    cancelada: 'bg-gray-100 text-gray-500',
  };
  return <span className={`px-2 py-0.5 text-xs rounded font-medium ${map[status] || map.pendiente}`}>{status || 'pendiente'}</span>;
}

function Empty({ text }) {
  return <div className="p-10 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">{text}</div>;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-gray-400 hover:text-gray-700">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="block mb-1 text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function FormButtons({ onCancel }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className={btnGhost}>Cancelar</button>
      <button type="submit" className={btnPrimary}>Guardar</button>
    </div>
  );
}

function Th({ children }) { return <th className="px-4 py-3 font-medium">{children}</th>; }
function Td({ children, className = '' }) { return <td className={`px-4 py-3 ${className}`}>{children}</td>; }

function computeNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 0;
}

function confirmDelete(what) {
  return typeof window !== 'undefined' && window.confirm(`¿Eliminar ${what}? Esta acción no se puede deshacer.`);
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition';
const btnPrimary = 'px-4 py-2 text-sm font-semibold text-white transition rounded-lg bg-rose-600 hover:bg-rose-500';
const btnGhost = 'px-4 py-2 text-sm font-semibold text-gray-700 transition border border-gray-300 rounded-lg hover:bg-gray-50';
