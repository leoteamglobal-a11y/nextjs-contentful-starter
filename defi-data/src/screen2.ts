// Screen de calidad v2: el screen de la etapa 1 + contexto de eventos (etapa 3).
// Añade los criterios que faltaban: AUDITORÍA y SIN HACK RECIENTE.
import { qualityScreen, type QualityThresholds } from "./normalize.js";
import type { ProtocolInfo } from "./protocols.js";
import type { NormalizedRow } from "./types.js";

export interface ScreenV2Options extends QualityThresholds {
  /** Exigir que el protocolo tenga al menos una auditoría (default true). */
  requireAudit?: boolean;
  /** Excluir protocolos con hack en el último año (default true). */
  excludeRecentHack?: boolean;
}

export interface ScreenedRow extends NormalizedRow {
  audited: boolean | null; // null = protocolo no encontrado en la metadata
  recentHack: boolean;
  protocolAgeDays: number | null;
}

/** Busca el protocolo por slug del `project` (con fallback quitando -vN). */
export function lookupProtocol(project: string, infoBySlug: Map<string, ProtocolInfo>): ProtocolInfo | undefined {
  if (infoBySlug.has(project)) return infoBySlug.get(project);
  const base = project.replace(/-v\d+$/, "");
  return infoBySlug.get(base);
}

/**
 * Screen v2: parte del screen base (apyBase/TVL/edad/incentivos) y agrega el
 * filtro de auditoría y de hack reciente usando la metadata de protocolos.
 */
export function qualityScreenV2(
  rows: NormalizedRow[],
  infoBySlug: Map<string, ProtocolInfo>,
  opts: ScreenV2Options = {},
): ScreenedRow[] {
  const requireAudit = opts.requireAudit ?? true;
  const excludeRecentHack = opts.excludeRecentHack ?? true;

  return qualityScreen(rows, opts)
    .map((r): ScreenedRow => {
      const info = lookupProtocol(r.project, infoBySlug);
      return {
        ...r,
        audited: info ? info.audited : null,
        recentHack: info ? info.recentHack : false,
        protocolAgeDays: info ? info.ageDays : null,
      };
    })
    .filter((r) => {
      if (requireAudit && !r.audited) return false; // null o false → fuera (conservador)
      if (excludeRecentHack && r.recentHack) return false;
      return true;
    });
}
