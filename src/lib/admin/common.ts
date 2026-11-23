import { normalizeSearch } from '@/domain/search';
import type { CurrentAdmin } from '@/lib/auth/require-admin';

// Utilidades de la lógica del panel (src/lib/admin/).

/** Lo que el panel necesita del administrador actual (los tests pasan solo el id). */
export type AdminActor = Pick<CurrentAdmin, 'id'>;

/** Slug a partir de un nombre: "Dra. Nerea Olmedo" → "dra-nerea-olmedo" (máximo 60). */
export function slugify(name: string): string {
  const s = normalizeSearch(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'elemento';
}

/** Primer slug libre: base, base-2, base-3… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = `-${i}`;
    const candidate = `${base.slice(0, 60 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Violación de una restricción única de PostgreSQL (23505), opcionalmente de una concreta. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = (error as { cause?: unknown })?.cause ?? error;
  const pg = e as { code?: string; constraint?: string };
  return pg?.code === '23505' && (constraint === undefined || pg.constraint === constraint);
}
