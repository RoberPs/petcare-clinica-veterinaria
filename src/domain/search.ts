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
