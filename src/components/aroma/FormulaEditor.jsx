'use client';

import { useState } from 'react';
import PyramidBar from './PyramidBar';
import {
  NOTE_TYPES,
  OLFACTORY_FAMILIES,
  emptyIngredient,
  totalPercentage,
  pyramidBreakdown,
  costPerKgConcentrate,
  batchPlan,
  normalizeToHundred,
  round,
} from '../../lib/formulas';

function money(n, d = 2) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
}

const STATUS_STYLES = {
  ok: 'text-emerald-600',
  bajo: 'text-amber-600',
  alto: 'text-red-500',
};
const STATUS_LABEL = { ok: 'En rango', bajo: 'Bajo', alto: 'Alto' };

export default function FormulaEditor({ formula, onChange, onBack }) {
  const [batchSize, setBatchSize] = useState(100);

  const total = totalPercentage(formula);
  const breakdown = pyramidBreakdown(formula);
  const cost = costPerKgConcentrate(formula);
  const plan = batchPlan(formula, batchSize, formula.concentration);
  const isBalanced = Math.abs(total - 100) < 0.01;

  function setField(field, value) {
    onChange({ ...formula, [field]: value });
  }

  function setIngredient(id, field, value) {
    onChange({
      ...formula,
      ingredients: formula.ingredients.map((ing) =>
        ing.id === id ? { ...ing, [field]: value } : ing
      ),
    });
  }

  function addIngredient() {
    onChange({ ...formula, ingredients: [...formula.ingredients, emptyIngredient()] });
  }

  function removeIngredient(id) {
    const remaining = formula.ingredients.filter((ing) => ing.id !== id);
    onChange({ ...formula, ingredients: remaining.length ? remaining : [emptyIngredient()] });
  }

  function normalize() {
    onChange(normalizeToHundred(formula));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-medium text-amber-dark transition hover:text-amber"
        >
          ← Volver a mis fórmulas
        </button>
        <span className="text-xs text-mocha">Guardado automáticamente ✓</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Columna principal */}
        <div className="space-y-6">
          {/* Datos generales */}
          <section className="rounded-2xl border border-sand bg-white p-5 shadow-sm">
            <input
              value={formula.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Nombre de la fragancia"
              className="w-full border-0 border-b border-sand bg-transparent pb-2 font-serif text-2xl text-ink outline-none placeholder:text-mocha/50 focus:border-amber"
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-mocha">
                  Familia olfativa
                </span>
                <select
                  value={formula.family}
                  onChange={(e) => setField('family', e.target.value)}
                  className="w-full rounded-lg border border-sand bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-amber"
                >
                  <option value="">— Seleccionar —</option>
                  {OLFACTORY_FAMILIES.map((fam) => (
                    <option key={fam} value={fam}>
                      {fam}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-mocha">
                  Concentración en producto final (%)
                </span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formula.concentration}
                  onChange={(e) => setField('concentration', round(e.target.value, 2))}
                  className="w-full rounded-lg border border-sand bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-amber"
                />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-mocha">
                Notas / descripción
              </span>
              <textarea
                value={formula.description}
                onChange={(e) => setField('description', e.target.value)}
                rows={2}
                placeholder="Idea, inspiración, observaciones del ensayo…"
                className="w-full rounded-lg border border-sand bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-amber"
              />
            </label>
          </section>

          {/* Ingredientes */}
          <section className="rounded-2xl border border-sand bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-lg text-ink">Ingredientes del concentrado</h3>
              <span
                className={`text-sm font-semibold ${isBalanced ? 'text-emerald-600' : 'text-amber-600'}`}
              >
                Total: {total}%
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-mocha">
                    <th className="pb-2 pr-2 font-medium">Materia prima</th>
                    <th className="pb-2 pr-2 font-medium">Nota</th>
                    <th className="pb-2 pr-2 text-right font-medium">%</th>
                    <th className="pb-2 pr-2 text-right font-medium">Costo/kg</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {formula.ingredients.map((ing) => (
                    <tr key={ing.id} className="border-t border-sand">
                      <td className="py-2 pr-2">
                        <input
                          value={ing.name}
                          onChange={(e) => setIngredient(ing.id, 'name', e.target.value)}
                          placeholder="Ej. Bergamota, Iso E Super…"
                          className="w-full min-w-[140px] rounded-md border border-transparent bg-cream px-2 py-1.5 text-ink outline-none focus:border-amber"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          value={ing.noteType}
                          onChange={(e) => setIngredient(ing.id, 'noteType', e.target.value)}
                          className="rounded-md border border-sand bg-cream px-2 py-1.5 text-ink outline-none focus:border-amber"
                        >
                          {NOTE_TYPES.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={ing.percentage}
                          onChange={(e) => setIngredient(ing.id, 'percentage', round(e.target.value, 3))}
                          className="w-20 rounded-md border border-sand bg-cream px-2 py-1.5 text-right text-ink outline-none focus:border-amber"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={ing.costPerKg}
                          onChange={(e) => setIngredient(ing.id, 'costPerKg', round(e.target.value, 2))}
                          className="w-24 rounded-md border border-sand bg-cream px-2 py-1.5 text-right text-ink outline-none focus:border-amber"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => removeIngredient(ing.id)}
                          className="rounded-md px-2 py-1 text-mocha transition hover:bg-red-50 hover:text-red-600"
                          aria-label="Eliminar ingrediente"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={addIngredient}
                className="rounded-lg border border-amber/40 px-3 py-1.5 text-sm font-medium text-amber-dark transition hover:bg-sand"
              >
                + Añadir ingrediente
              </button>
              <button
                onClick={normalize}
                disabled={total <= 0 || isBalanced}
                className="rounded-lg bg-amber px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-dark disabled:cursor-not-allowed disabled:opacity-40"
                title="Escala todos los porcentajes proporcionalmente para que sumen 100%"
              >
                Optimizar → normalizar a 100%
              </button>
            </div>
          </section>
        </div>

        {/* Columna lateral: análisis */}
        <aside className="space-y-6">
          {/* Pirámide olfativa */}
          <section className="rounded-2xl border border-sand bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-serif text-lg text-ink">Pirámide olfativa</h3>
            <PyramidBar breakdown={breakdown} height={12} />
            <ul className="mt-4 space-y-2">
              {breakdown.map((b) => (
                <li key={b.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{b.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">{b.share}%</span>
                    <span className={`text-xs ${STATUS_STYLES[b.status]}`}>
                      {STATUS_LABEL[b.status]}
                      <span className="text-mocha"> ({b.ideal.min}–{b.ideal.max}%)</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-mocha">
              Los rangos son una guía clásica de equilibrio. Ajusta según tu estilo.
            </p>
          </section>

          {/* Costos */}
          <section className="rounded-2xl border border-sand bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-serif text-lg text-ink">Costo</h3>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-mocha">Concentrado por kg</span>
              <span className="font-serif text-xl text-amber-dark">${money(cost)}</span>
            </div>
          </section>

          {/* Calculadora de lotes */}
          <section className="rounded-2xl border border-sand bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-serif text-lg text-ink">Calculadora de lote</h3>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-mocha">
                Tamaño del producto final (g o ml)
              </span>
              <input
                type="number"
                min="1"
                value={batchSize}
                onChange={(e) => setBatchSize(round(e.target.value, 2))}
                className="w-full rounded-lg border border-sand bg-cream px-3 py-2 text-sm text-ink outline-none focus:border-amber"
              />
            </label>

            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between text-mocha">
                <span>Concentrado ({plan.concentration}%)</span>
                <span className="font-medium text-ink">{plan.concentrateGrams} g</span>
              </div>
              <div className="flex justify-between text-mocha">
                <span>Alcohol / diluyente</span>
                <span className="font-medium text-ink">{plan.carrierGrams} g</span>
              </div>
            </div>

            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg bg-cream p-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-mocha">
                    <th className="pb-1 font-medium">Ingrediente</th>
                    <th className="pb-1 text-right font-medium">Cant.</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-0.5 text-ink">{r.name || '—'}</td>
                      <td className="py-0.5 text-right text-ink">{r.grams} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-baseline justify-between border-t border-sand pt-3">
              <span className="text-sm text-mocha">Costo del concentrado</span>
              <span className="font-serif text-lg text-amber-dark">${money(plan.concentrateCost, 2)}</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
