'use client';

import PyramidBar from './PyramidBar';
import { totalPercentage, pyramidBreakdown, costPerKgConcentrate } from '../../lib/formulas';

function money(n) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FormulaList({ formulas, onNew, onEdit, onDelete, onExport, onImport }) {
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl text-ink">Mis fórmulas</h2>
          <p className="text-sm text-mocha">
            {formulas.length === 0
              ? 'Aún no tienes fórmulas. Crea la primera para empezar.'
              : `${formulas.length} fórmula${formulas.length === 1 ? '' : 's'} guardada${formulas.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onImport}
            className="rounded-lg border border-amber/40 px-4 py-2 text-sm font-medium text-amber-dark transition hover:bg-sand"
          >
            Importar
          </button>
          <button
            onClick={onExport}
            disabled={formulas.length === 0}
            className="rounded-lg border border-amber/40 px-4 py-2 text-sm font-medium text-amber-dark transition hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
          >
            Exportar respaldo
          </button>
          <button
            onClick={onNew}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-dark"
          >
            + Nueva fórmula
          </button>
        </div>
      </div>

      {formulas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber/40 bg-white/50 p-12 text-center">
          <div className="mb-3 text-4xl">🧪</div>
          <p className="font-serif text-lg text-ink">Tu estudio de perfumería está listo</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-mocha">
            Registra tus materias primas, ajusta los porcentajes de la pirámide olfativa y
            calcula costos y lotes. Todo se guarda automáticamente en este dispositivo.
          </p>
          <button
            onClick={onNew}
            className="mt-6 rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-dark"
          >
            Crear mi primera fórmula
          </button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {formulas.map((f) => {
            const total = totalPercentage(f);
            const breakdown = pyramidBreakdown(f);
            const cost = costPerKgConcentrate(f);
            return (
              <div
                key={f.id}
                className="group flex flex-col rounded-2xl border border-sand bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <button onClick={() => onEdit(f.id)} className="flex-1 text-left">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="font-serif text-lg leading-tight text-ink">
                      {f.name || 'Fórmula sin nombre'}
                    </h3>
                  </div>
                  {f.family && (
                    <span className="inline-block rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium text-amber-dark">
                      {f.family}
                    </span>
                  )}
                  {f.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-mocha">{f.description}</p>
                  )}
                  <div className="mt-4">
                    <PyramidBar breakdown={breakdown} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-sm font-semibold text-ink">{f.ingredients.length}</div>
                      <div className="text-[11px] uppercase tracking-wide text-mocha">Ingred.</div>
                    </div>
                    <div>
                      <div
                        className={`text-sm font-semibold ${Math.abs(total - 100) < 0.01 ? 'text-emerald-600' : 'text-ink'}`}
                      >
                        {total}%
                      </div>
                      <div className="text-[11px] uppercase tracking-wide text-mocha">Total</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">${money(cost)}</div>
                      <div className="text-[11px] uppercase tracking-wide text-mocha">Costo/kg</div>
                    </div>
                  </div>
                </button>
                <div className="mt-4 flex gap-2 border-t border-sand pt-3">
                  <button
                    onClick={() => onEdit(f.id)}
                    className="flex-1 rounded-lg bg-sand px-3 py-1.5 text-sm font-medium text-amber-dark transition hover:bg-amber hover:text-white"
                  >
                    Abrir
                  </button>
                  <button
                    onClick={() => onDelete(f.id)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-mocha transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Eliminar fórmula"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
