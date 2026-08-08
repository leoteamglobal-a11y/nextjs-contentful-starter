// Aroma World — modelo de datos, almacenamiento y cálculos de fórmulas de fragancia.
// Toda la información se guarda de forma persistente en el navegador (localStorage)
// y puede exportarse/importarse como respaldo en JSON.

const STORAGE_KEY = 'aromaworld.formulas.v1';

export const NOTE_TYPES = [
  { id: 'salida', label: 'Salida', help: 'Primera impresión, se evapora rápido (cítricos, aromáticos).' },
  { id: 'corazon', label: 'Corazón', help: 'El cuerpo de la fragancia (florales, especias, frutas).' },
  { id: 'fondo', label: 'Fondo', help: 'Notas que fijan y perduran (maderas, ámbar, almizcles).' },
];

// Rango recomendado de la pirámide olfativa (porcentaje sobre el concentrado).
export const IDEAL_PYRAMID = {
  salida: { min: 15, max: 25 },
  corazon: { min: 30, max: 40 },
  fondo: { min: 40, max: 55 },
};

export const OLFACTORY_FAMILIES = [
  'Cítrica',
  'Floral',
  'Amaderada',
  'Oriental / Ámbar',
  'Aromática / Fougère',
  'Chipre',
  'Gourmand',
  'Acuática',
  'Verde',
  'Especiada',
];

// --- Utilidades internas ---

function uid() {
  // Identificador simple y estable (no requiere Date.now en el render).
  return 'id-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function round(value, decimals = 2) {
  const f = Math.pow(10, decimals);
  return Math.round((num(value) + Number.EPSILON) * f) / f;
}

// --- Fábricas ---

export function emptyIngredient() {
  return {
    id: uid(),
    name: '',
    noteType: 'corazon',
    percentage: 0,
    costPerKg: 0, // costo de la materia prima por kilogramo (en tu moneda)
  };
}

export function emptyFormula() {
  return {
    id: uid(),
    name: '',
    family: '',
    description: '',
    concentration: 20, // % de concentrado en el producto final (p. ej. EDP ≈ 20%)
    ingredients: [emptyIngredient()],
    createdAt: null,
    updatedAt: null,
  };
}

// --- Almacenamiento (localStorage) ---

export function loadFormulas() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('No se pudieron cargar las fórmulas:', e);
    return [];
  }
}

export function saveFormulas(formulas) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(formulas));
  } catch (e) {
    console.error('No se pudieron guardar las fórmulas:', e);
  }
}

export function exportFormulas(formulas) {
  return JSON.stringify(formulas, null, 2);
}

export function importFormulas(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error('El archivo no contiene una lista de fórmulas.');
  // Validación mínima para evitar datos corruptos.
  return parsed.map((f) => ({
    ...emptyFormula(),
    ...f,
    ingredients: Array.isArray(f.ingredients) && f.ingredients.length
      ? f.ingredients.map((ing) => ({ ...emptyIngredient(), ...ing }))
      : [emptyIngredient()],
  }));
}

// --- Cálculos ---

// Suma total de los porcentajes del concentrado.
export function totalPercentage(formula) {
  return round((formula.ingredients || []).reduce((sum, ing) => sum + num(ing.percentage), 0));
}

// Porcentaje agrupado por tipo de nota.
export function pyramidBreakdown(formula) {
  const total = totalPercentage(formula) || 1;
  const byNote = { salida: 0, corazon: 0, fondo: 0 };
  for (const ing of formula.ingredients || []) {
    if (byNote[ing.noteType] === undefined) byNote[ing.noteType] = 0;
    byNote[ing.noteType] += num(ing.percentage);
  }
  return NOTE_TYPES.map((n) => {
    const value = round(byNote[n.id] || 0);
    const share = round((value / total) * 100); // % relativo dentro del concentrado
    const ideal = IDEAL_PYRAMID[n.id];
    const status = !ideal
      ? 'ok'
      : share < ideal.min
        ? 'bajo'
        : share > ideal.max
          ? 'alto'
          : 'ok';
    return { ...n, value, share, ideal, status };
  });
}

// Costo por kilogramo de CONCENTRADO puro.
export function costPerKgConcentrate(formula) {
  const total = totalPercentage(formula);
  if (total <= 0) return 0;
  // Costo ponderado: sum(fracción de cada ingrediente * costo/kg).
  const weighted = (formula.ingredients || []).reduce(
    (sum, ing) => sum + (num(ing.percentage) / total) * num(ing.costPerKg),
    0
  );
  return round(weighted);
}

// Escala la fórmula a un lote concreto del PRODUCTO FINAL.
// batchSize en gramos; concentration = % de concentrado en el producto.
export function batchPlan(formula, batchSizeGrams, concentrationPct) {
  const total = totalPercentage(formula) || 1;
  const concentration = num(concentrationPct != null ? concentrationPct : formula.concentration);
  const concentrateGrams = (num(batchSizeGrams) * concentration) / 100;
  const rows = (formula.ingredients || []).map((ing) => {
    const grams = round((num(ing.percentage) / total) * concentrateGrams, 3);
    const cost = round((grams / 1000) * num(ing.costPerKg), 4);
    return { id: ing.id, name: ing.name, noteType: ing.noteType, grams, cost };
  });
  const concentrateCost = round(rows.reduce((s, r) => s + r.cost, 0), 4);
  const carrierGrams = round(num(batchSizeGrams) - concentrateGrams, 3); // alcohol / diluyente
  return {
    batchSizeGrams: num(batchSizeGrams),
    concentration,
    concentrateGrams: round(concentrateGrams, 3),
    carrierGrams,
    rows,
    concentrateCost,
  };
}

// Devuelve una copia de la fórmula con los porcentajes normalizados a 100%.
export function normalizeToHundred(formula) {
  const total = totalPercentage(formula);
  if (total <= 0) return formula;
  return {
    ...formula,
    ingredients: formula.ingredients.map((ing) => ({
      ...ing,
      percentage: round((num(ing.percentage) / total) * 100, 3),
    })),
  };
}
