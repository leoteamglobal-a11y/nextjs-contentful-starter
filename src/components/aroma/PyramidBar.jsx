'use client';

const COLORS = {
  salida: 'var(--color-amber)',
  corazon: 'var(--color-amber-dark)',
  fondo: 'var(--color-mocha)',
};

// Barra horizontal que muestra la distribución de la pirámide olfativa.
export default function PyramidBar({ breakdown, height = 8 }) {
  const total = breakdown.reduce((s, b) => s + b.value, 0) || 1;
  return (
    <div
      className="flex w-full overflow-hidden rounded-full bg-sand"
      style={{ height }}
      title="Distribución salida / corazón / fondo"
    >
      {breakdown.map((b) => {
        const pct = (b.value / total) * 100;
        if (pct <= 0) return null;
        return (
          <div
            key={b.id}
            style={{ width: `${pct}%`, background: COLORS[b.id] }}
            title={`${b.label}: ${b.share}%`}
          />
        );
      })}
    </div>
  );
}
