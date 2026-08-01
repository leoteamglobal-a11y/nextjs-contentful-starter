'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { estimateMonthly, formatMoney } from './lib/finance.js';

export function Calculator() {
  const [nightlyRate, setNightlyRate] = useState(80);
  const [occupancy, setOccupancy] = useState(65);
  const [commissionPct, setCommissionPct] = useState(20);

  const result = useMemo(
    () => estimateMonthly({ nightlyRate, occupancy, commissionPct, monthlyCosts: 0 }),
    [nightlyRate, occupancy, commissionPct],
  );

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-6">
        <Slider label="Tarifa promedio por noche" value={nightlyRate} min={20} max={400} step={5}
          onChange={setNightlyRate} format={(v) => formatMoney(v)} />
        <Slider label="Ocupación esperada" value={occupancy} min={20} max={95} step={1}
          onChange={setOccupancy} format={(v) => `${v}%`} />
        <Slider label="Tu comisión como co-host" value={commissionPct} min={10} max={30} step={1}
          onChange={setCommissionPct} format={(v) => `${v}%`} />
      </div>

      <div className="flex flex-col justify-center gap-4 p-6 text-white bg-gray-900 rounded-2xl">
        <div>
          <p className="text-sm text-gray-400">Ingreso mensual de la propiedad</p>
          <p className="text-2xl font-bold">{formatMoney(result.grossRevenue)}</p>
        </div>
        <div className="pt-4 border-t border-gray-700">
          <p className="text-sm text-rose-300">Tu ganancia mensual (comisión)</p>
          <p className="text-4xl font-extrabold text-rose-400">{formatMoney(result.yourCommission)}</p>
          <p className="mt-1 text-sm text-gray-400">
            ≈ {formatMoney(result.yourCommissionYearly)} al año, por 1 sola propiedad
          </p>
        </div>
        <p className="text-xs text-gray-500">
          Estimación con ~{result.nightsPerMonth} noches ocupadas/mes. Los números reales dependen de tu mercado.
        </p>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="font-medium text-gray-700">{label}</label>
        <span className="font-bold text-rose-600">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-rose-600"
      />
    </div>
  );
}

export function LeadForm() {
  const [form, setForm] = useState({ name: '', contact: '', city: '', properties: 1, message: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [error, setError] = useState('');

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    setError('');

    // Respaldo local: nunca se pierde un prospecto aunque falle el servidor.
    try {
      const backup = JSON.parse(localStorage.getItem('airbnb_leads') || '[]');
      backup.unshift({ ...form, receivedAt: new Date().toISOString() });
      localStorage.setItem('airbnb_leads', JSON.stringify(backup));
    } catch {
      /* localStorage no disponible */
    }

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo enviar.');
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className="p-8 text-center bg-white shadow-lg rounded-2xl">
        <div className="mb-4 text-5xl">🎉</div>
        <h3 className="mb-2 text-2xl font-bold text-gray-900">¡Solicitud recibida!</h3>
        <p className="text-gray-600">
          Gracias, {form.name.split(' ')[0]}. Te contactaremos pronto para agendar una llamada y calcular
          el potencial de tu propiedad. También guardamos tu solicitud en este dispositivo.
        </p>
        <Link href="/airbnb/panel" className="inline-block px-6 py-3 mt-6 font-semibold text-white transition rounded-lg bg-rose-600 hover:bg-rose-500">
          Ver el panel de gestión →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white shadow-lg sm:p-8 rounded-2xl">
      <h3 className="text-2xl font-bold text-gray-900">Solicita tu evaluación gratuita</h3>
      <p className="text-sm text-gray-500">Déjanos tus datos y te decimos cuánto puede generar tu propiedad.</p>

      <Field label="Nombre completo *">
        <input required value={form.name} onChange={update('name')} className={inputCls} placeholder="Ana Martínez" />
      </Field>
      <Field label="Teléfono o email *">
        <input required value={form.contact} onChange={update('contact')} className={inputCls} placeholder="+52 55 1234 5678" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Ciudad">
          <input value={form.city} onChange={update('city')} className={inputCls} placeholder="CDMX" />
        </Field>
        <Field label="¿Cuántas propiedades?">
          <input type="number" min={0} value={form.properties} onChange={update('properties')} className={inputCls} />
        </Field>
      </div>
      <Field label="Cuéntanos sobre tu propiedad (opcional)">
        <textarea value={form.message} onChange={update('message')} rows={3} className={inputCls}
          placeholder="Depto de 2 recámaras en el centro, actualmente vacío..." />
      </Field>

      {status === 'error' && <p className="text-sm text-red-600">⚠️ {error}</p>}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full px-6 py-3 font-semibold text-white transition rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60"
      >
        {status === 'sending' ? 'Enviando…' : 'Quiero mi evaluación gratis'}
      </button>
      <p className="text-xs text-center text-gray-400">Sin compromiso. Respondemos en menos de 24 horas.</p>
    </form>
  );
}

const inputCls =
  'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block mb-1 text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
