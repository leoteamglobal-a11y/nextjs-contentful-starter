// Almacén APPEND-ONLY en JSONL, particionado por fecha. Nunca se sobrescribe un
// día (idempotente): la historia es sagrada. En la etapa 2 esto se carga a
// SQLite/Parquet para consultas, pero el crudo JSONL siempre se conserva.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NormalizedRow, RawPool } from "./types.js";

export const DEFAULT_DATA_DIR = "data";

function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

function toJsonl(rows: unknown[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

export function rawPath(date: string, dir = DEFAULT_DATA_DIR): string {
  return join(dir, "raw", `${date}.jsonl`);
}
export function normalizedPath(date: string, dir = DEFAULT_DATA_DIR): string {
  return join(dir, "normalized", `${date}.jsonl`);
}

/** Escribe el snapshot crudo del día. Si ya existe y no es force, no lo pisa. */
export function writeRawSnapshot(pools: RawPool[], date: string, dir = DEFAULT_DATA_DIR, force = false): boolean {
  const file = rawPath(date, dir);
  if (existsSync(file) && !force) return false;
  ensureDir(file);
  writeFileSync(file, toJsonl(pools));
  return true;
}

/** Escribe las filas normalizadas del día. */
export function writeNormalizedSnapshot(rows: NormalizedRow[], date: string, dir = DEFAULT_DATA_DIR, force = false): boolean {
  const file = normalizedPath(date, dir);
  if (existsSync(file) && !force) return false;
  ensureDir(file);
  writeFileSync(file, toJsonl(rows));
  return true;
}

/** Lee las filas normalizadas de una fecha. */
export function readNormalizedSnapshot(date: string, dir = DEFAULT_DATA_DIR): NormalizedRow[] {
  const file = normalizedPath(date, dir);
  const text = readFileSync(file, "utf8");
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as NormalizedRow);
}

/** Fecha UTC de hoy en formato YYYY-MM-DD. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
