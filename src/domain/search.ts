// Búsqueda por nombre sin tildes ni mayúsculas (C4). La misma función calcula products.search_name
// en la carga y normaliza el término en la consulta, así que no pueden divergir.

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escapa los comodines de LIKE (con ESCAPE '\'). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const SEARCH_WORDS_MAX = 8;
export const SEARCH_TEXT_MAX = 100;

/**
 * Palabras de una búsqueda de consejos (E4): texto recortado a 100 caracteres, normalizado sin
 * tildes ni mayúsculas, sin repetir y con un máximo de 8. Los comodines de LIKE se escapan al
 * consultar (escapeLike), así que aquí se conservan como literales.
 */
export function searchWords(q: string): string[] {
  const words = normalizeSearch(q.slice(0, SEARCH_TEXT_MAX)).split(' ').filter(Boolean);
  return [...new Set(words)].slice(0, SEARCH_WORDS_MAX);
}
