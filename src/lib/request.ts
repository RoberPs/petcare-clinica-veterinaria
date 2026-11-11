import { headers } from 'next/headers';
import { isSafeReturnTo } from './return-to';

/** Ruta de la petición actual (la fija src/middleware.ts). Sirve como return_to de los formularios. */
export async function getPathname(): Promise<string> {
  const path = (await headers()).get('x-pathname');
  return isSafeReturnTo(path) ? path : '/';
}
