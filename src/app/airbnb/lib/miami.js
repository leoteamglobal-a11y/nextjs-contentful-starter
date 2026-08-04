// Datos de mercado de Miami-Dade y Broward (síntesis del estudio de mercado).
// Tarifas (ADR) y ocupación son aproximaciones basadas en fuentes públicas
// 2024–2026 (AirDNA, AirROI, Airbtics, Rabbu) y deben tomarse como referencia.
// tag: 'ok' zona generalmente permisiva · 'restricted' zona con reglas STR estrictas.

export const NEIGHBORHOODS = [
  { id: 'brickell', name: 'Brickell', county: 'miami-dade', rate: 315, occ: 60, tag: 'ok' },
  { id: 'downtown', name: 'Downtown Miami', county: 'miami-dade', rate: 260, occ: 55, tag: 'ok' },
  { id: 'wynwood', name: 'Wynwood', county: 'miami-dade', rate: 231, occ: 58, tag: 'ok' },
  { id: 'south-beach', name: 'South Beach (Miami Beach)', county: 'miami-dade', rate: 375, occ: 50, tag: 'restricted' },
  { id: 'sunny-isles', name: 'Sunny Isles Beach', county: 'miami-dade', rate: 300, occ: 50, tag: 'restricted' },
  { id: 'doral', name: 'Doral', county: 'miami-dade', rate: 200, occ: 50, tag: 'restricted' },
  { id: 'fort-lauderdale', name: 'Fort Lauderdale Beach', county: 'broward', rate: 212, occ: 65, tag: 'ok' },
  { id: 'hollywood', name: 'Hollywood', county: 'broward', rate: 214, occ: 68, tag: 'ok' },
  { id: 'pompano', name: 'Pompano Beach', county: 'broward', rate: 196, occ: 62, tag: 'ok' },
  { id: 'hallandale', name: 'Hallandale Beach', county: 'broward', rate: 251, occ: 45, tag: 'restricted' },
];

// Valores por defecto por condado (co-host bien gestionado, entre mediana y media).
export const COUNTY_DEFAULTS = {
  'miami-dade': { rate: 245, occ: 53 },
  broward: { rate: 225, occ: 58 },
};

// Comisión con la que se posiciona el negocio (transparente, todo incluido).
export const DEFAULT_COMMISSION = 18;
