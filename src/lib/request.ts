import { headers } from 'next/headers';
import { isSafeReturnTo } from './return-to';

/** Ruta de la petición actual (la fija src/middleware.ts). Sirve como return_to de los formularios. */
export async function getPathname(): Promise<string> {
  const h = await headers();
  // Con la query si cabe (feature 003: los pasos de /pide-cita viajan en ella); si no, solo la ruta.
  const withQuery = h.get('x-return-to');
  if (isSafeReturnTo(withQuery)) return withQuery;
  const path = h.get('x-pathname');
  return isSafeReturnTo(path) ? path : '/';
}
