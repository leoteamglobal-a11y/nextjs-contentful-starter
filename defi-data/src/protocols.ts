// Metadata de protocolos (auditorías, edad) y hacks — desde DefiLlama.
// Completa los criterios que faltaban del screen: auditorías e historial de exploits.
import type { DefiEvent } from "./events.js";

export interface ProtocolMeta {
  slug: string;
  name: string;
  category: string | null;
  auditCount: number;
  audited: boolean;
  ageDays: number | null;
}

export interface ProtocolInfo extends ProtocolMeta {
  recentHack: boolean;
}

function normSlug(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "-");
}
function daysSinceUnix(unixSec: number | null | undefined, asOfDate: string): number | null {
  if (!unixSec || !Number.isFinite(unixSec)) return null;
  const asOf = Date.parse(asOfDate + "T00:00:00Z");
  if (Number.isNaN(asOf)) return null;
  return Math.max(0, Math.floor((asOf - unixSec * 1000) / 86_400_000));
}

interface RawProtocol {
  name?: string;
  slug?: string;
  category?: string;
  audits?: string | number;
  audit_links?: string[];
  listedAt?: number;
}

/** DefiLlama /protocols crudo → metadata normalizada. */
export function normalizeProtocols(raw: unknown, asOfDate: string): ProtocolMeta[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawProtocol[]).map((p) => {
    const auditCount = Number(p.audits ?? 0) || (p.audit_links?.length ?? 0);
    return {
      slug: normSlug(p.slug ?? p.name ?? ""),
      name: p.name ?? "",
      category: p.category ?? null,
      auditCount,
      audited: auditCount > 0,
      ageDays: daysSinceUnix(p.listedAt, asOfDate),
    };
  });
}

interface RawHack {
  date?: number; // unix seconds
  name?: string;
  amount?: number; // USD (a veces en millones; DefiLlama usa USD absoluto)
  classification?: string;
  technique?: string;
  chains?: string[];
}

/** DefiLlama /hacks crudo → eventos `hack`. */
export function hacksToEvents(raw: unknown): DefiEvent[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawHack[])
    .filter((h) => h.name && h.date)
    .map((h) => ({
      date: new Date((h.date as number) * 1000).toISOString().slice(0, 10),
      type: "hack" as const,
      scope: "protocol" as const,
      ref: normSlug(h.name as string),
      detail: [h.classification, h.technique].filter(Boolean).join(" / ") || undefined,
      amountUsd: typeof h.amount === "number" ? h.amount : null,
      source: "defillama-hacks",
    }));
}

/** Combina metadata + hacks recientes en un mapa por slug. */
export function buildProtocolInfo(
  metas: ProtocolMeta[],
  hackEvents: DefiEvent[],
  asOfDate: string,
  recentHackDays = 365,
): Map<string, ProtocolInfo> {
  const asOf = Date.parse(asOfDate + "T00:00:00Z");
  const recentHackSlugs = new Set(
    hackEvents
      .filter((e) => e.type === "hack")
      .filter((e) => {
        const t = Date.parse(e.date + "T00:00:00Z");
        return !Number.isNaN(t) && asOf - t <= recentHackDays * 86_400_000;
      })
      .map((e) => e.ref),
  );

  const map = new Map<string, ProtocolInfo>();
  for (const m of metas) {
    // Un hack "reciente" matchea si su ref contiene el slug del protocolo o viceversa.
    const recentHack = [...recentHackSlugs].some((h) => h.includes(m.slug) || m.slug.includes(h));
    map.set(m.slug, { ...m, recentHack });
  }
  return map;
}
