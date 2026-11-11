import { redirect } from 'next/navigation';
import { getPathname } from '@/lib/request';
import { isSafeReturnTo } from '@/lib/return-to';
import { getCurrentSession, type CurrentCustomer } from './session';

// Guardia de las páginas, acciones y rutas privadas (A3). El layout de /mi-cuenta no basta: las
// Server Actions se pueden invocar directamente, así que cada una la llama también.

export function loginUrl(returnTo?: string | null): string {
  return isSafeReturnTo(returnTo) && returnTo !== '/'
    ? `/iniciar-sesion?return_to=${encodeURIComponent(returnTo)}`
    : '/iniciar-sesion';
}

/** Cliente con sesión vigente; si no hay, redirige a iniciar sesión con la ruta actual de vuelta. */
export async function requireCustomer(): Promise<CurrentCustomer> {
  const customer = await getCurrentSession();
  if (customer) return customer;
  redirect(loginUrl(await getPathname()));
}

/** Cliente con sesión vigente, o null (páginas públicas que cambian si ya has entrado). */
export async function getOptionalCustomer(): Promise<CurrentCustomer | null> {
  return getCurrentSession();
}
