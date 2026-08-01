// Lógica de negocio compartida para el sistema de co-hosting de Airbnb.
// Todo el dinero se maneja en la moneda que el usuario decida (sin conversión).

/**
 * Estima los ingresos mensuales de una propiedad en Airbnb.
 * @param {number} nightlyRate - Tarifa promedio por noche.
 * @param {number} occupancy - Ocupación esperada (0-100, en %).
 * @param {number} commissionPct - Tu comisión como co-host (0-100, en %).
 * @param {number} monthlyCosts - Costos operativos mensuales (limpieza, servicios, etc.).
 */
export function estimateMonthly({ nightlyRate = 0, occupancy = 0, commissionPct = 0, monthlyCosts = 0 }) {
  const nightsPerMonth = 30 * (clamp(occupancy, 0, 100) / 100);
  const grossRevenue = nightlyRate * nightsPerMonth;
  const yourCommission = grossRevenue * (clamp(commissionPct, 0, 100) / 100);
  const ownerNet = grossRevenue - yourCommission - monthlyCosts;
  return {
    nightsPerMonth: round(nightsPerMonth, 1),
    grossRevenue: round(grossRevenue),
    yourCommission: round(yourCommission),
    ownerNet: round(ownerNet),
    yourCommissionYearly: round(yourCommission * 12),
  };
}

/** Ingresos por una reserva concreta. */
export function reservationIncome({ nights = 0, nightlyRate = 0, commissionPct = 0, extraFees = 0 }) {
  const gross = nights * nightlyRate + extraFees;
  const commission = gross * (clamp(commissionPct, 0, 100) / 100);
  return { gross: round(gross), commission: round(commission) };
}

export function clamp(n, min, max) {
  const v = Number(n) || 0;
  return Math.min(Math.max(v, min), max);
}

export function round(n, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round((Number(n) || 0) * f) / f;
}

export function formatMoney(n, currency = '$') {
  const value = Number(n) || 0;
  return `${currency}${value.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
