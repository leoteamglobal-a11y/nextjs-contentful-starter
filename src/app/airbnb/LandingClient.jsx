'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { estimateMonthly, formatMoney } from './lib/finance.js';
import { NEIGHBORHOODS, COUNTY_DEFAULTS, DEFAULT_COMMISSION } from './lib/miami.js';
import { useLang } from './i18n/context.jsx';

export function Calculator() {
  const { t } = useLang();
  const [county, setCounty] = useState('miami-dade');
  const [hood, setHood] = useState('custom');
  const [nightlyRate, setNightlyRate] = useState(COUNTY_DEFAULTS['miami-dade'].rate);
  const [occupancy, setOccupancy] = useState(COUNTY_DEFAULTS['miami-dade'].occ);
  const [commissionPct, setCommissionPct] = useState(DEFAULT_COMMISSION);
  const [costs, setCosts] = useState(200);

  const hoods = useMemo(() => NEIGHBORHOODS.filter((n) => n.county === county), [county]);
  const activeHood = NEIGHBORHOODS.find((n) => n.id === hood);

  function onCounty(e) {
    const c = e.target.value;
    setCounty(c);
    setHood('custom');
    setNightlyRate(COUNTY_DEFAULTS[c].rate);
    setOccupancy(COUNTY_DEFAULTS[c].occ);
  }
  function onHood(e) {
    const id = e.target.value;
    setHood(id);
    const n = NEIGHBORHOODS.find((x) => x.id === id);
    if (n) {
      setNightlyRate(n.rate);
      setOccupancy(n.occ);
    }
  }

  const result = useMemo(
    () => estimateMonthly({ nightlyRate, occupancy, commissionPct, monthlyCosts: costs }),
    [nightlyRate, occupancy, commissionPct, costs],
  );

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Select label={t('calc.county')} value={county} onChange={onCounty}
            options={[['miami-dade', t('calc.counties.miami-dade')], ['broward', t('calc.counties.broward')]]} />
          <Select label={t('calc.neighborhood')} value={hood} onChange={onHood}
            options={[['custom', t('calc.neighborhoodCustom')], ...hoods.map((n) => [n.id, n.name])]} />
        </div>

        {activeHood && (
          <p className={`text-xs font-medium ${activeHood.tag === 'restricted' ? 'text-amber-600' : 'text-emerald-600'}`}>
            {activeHood.tag === 'restricted' ? '⚠️ ' : '✓ '}
            {activeHood.tag === 'restricted' ? t('calc.tagRestricted') : t('calc.tagOk')}
          </p>
        )}

        <Slider label={t('calc.rate')} value={nightlyRate} min={80} max={600} step={5}
          onChange={setNightlyRate} format={(v) => formatMoney(v)} />
        <Slider label={t('calc.occupancy')} value={occupancy} min={30} max={90} step={1}
          onChange={setOccupancy} format={(v) => `${v}%`} />
        <Slider label={t('calc.commission')} value={commissionPct} min={12} max={25} step={1}
          onChange={setCommissionPct} format={(v) => `${v}%`} />
        <Slider label={t('calc.costs')} value={costs} min={0} max={1000} step={25}
          onChange={setCosts} format={(v) => formatMoney(v)} />
      </div>

      <div className="flex flex-col justify-center gap-3 p-6 text-white bg-gray-900 rounded-2xl">
        <Row k={t('calc.resNights')} v={result.nightsPerMonth} muted />
        <Row k={t('calc.resGross')} v={formatMoney(result.grossRevenue)} />
        <Row k={t('calc.resCommission')} v={`−${formatMoney(result.yourCommission)}`} />
        <Row k={t('calc.resCosts')} v={`−${formatMoney(costs)}`} />
        <div className="p-4 mt-2 bg-rose-950/60 rounded-xl">
          <p className="text-sm text-rose-300">{t('calc.resNet')}</p>
          <p className="text-4xl font-extrabold text-rose-400">{formatMoney(result.ownerNet)}</p>
          <p className="mt-1 text-sm text-gray-400">≈ {formatMoney(result.ownerNet * 12)} {t('calc.resYear')}</p>
        </div>
        <p className="text-xs text-gray-500">{t('calc.note')}</p>
      </div>
    </div>
  );
}

function Row({ k, v, muted }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-sm ${muted ? 'text-gray-500' : 'text-gray-300'}`}>{k}</span>
      <span className={`font-bold tabular-nums ${muted ? 'text-gray-400' : 'text-white'}`}>{v}</span>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block mb-1 text-sm font-medium text-gray-700">{label}</span>
      <select value={value} onChange={onChange} className={inputCls}>
        {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, format }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="font-medium text-gray-700">{label}</label>
        <span className="font-bold text-rose-600 tabular-nums">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-rose-600" />
    </div>
  );
}

export function LeadForm() {
  const { t } = useLang();
  const [form, setForm] = useState({ name: '', contact: '', city: '', properties: 1, message: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('sending');
    setError('');
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
        body: JSON.stringify({ ...form, source: 'landing-miami' }),
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
        <h3 className="mb-2 text-2xl font-bold text-gray-900">{t('lead.successTitle')}</h3>
        <p className="text-gray-600">{t('lead.successBody')}</p>
        <Link href="/airbnb/panel" className="inline-block px-6 py-3 mt-6 font-semibold text-white transition rounded-lg bg-rose-600 hover:bg-rose-500">
          {t('lead.successPanel')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white shadow-lg sm:p-8 rounded-2xl">
      <h3 className="text-2xl font-bold text-gray-900">{t('lead.formTitle')}</h3>
      <p className="text-sm text-gray-500">{t('lead.formSub')}</p>
      <Field label={t('lead.name')}>
        <input required value={form.name} onChange={update('name')} className={inputCls} placeholder="Ana Martínez" />
      </Field>
      <Field label={t('lead.contact')}>
        <input required value={form.contact} onChange={update('contact')} className={inputCls} placeholder="+1 305 123 4567" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('lead.city')}>
          <input value={form.city} onChange={update('city')} className={inputCls} placeholder="Brickell, Miami" />
        </Field>
        <Field label={t('lead.properties')}>
          <input type="number" min={0} value={form.properties} onChange={update('properties')} className={inputCls} />
        </Field>
      </div>
      <Field label={t('lead.message')}>
        <textarea value={form.message} onChange={update('message')} rows={3} className={inputCls} placeholder={t('lead.messagePlaceholder')} />
      </Field>
      {status === 'error' && <p className="text-sm text-red-600">{t('lead.errorPrefix')}{error}</p>}
      <button type="submit" disabled={status === 'sending'}
        className="w-full px-6 py-3 font-semibold text-white transition rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60">
        {status === 'sending' ? t('lead.sending') : t('lead.submit')}
      </button>
      <p className="text-xs text-center text-gray-400">{t('lead.disclaimer')}</p>
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
