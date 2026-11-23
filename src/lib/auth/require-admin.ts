import { notFound, redirect } from 'next/navigation';
import { getPathname } from '@/lib/request';
import { loginUrl } from './require-customer';
import { getCurrentSession, type CurrentCustomer } from './session';

// Guardia del panel (F2). La llaman el layout de /admin y, al principio, cada Server Action del
// panel: los layouts no se ejecutan en las acciones. `lookupSession` relee el cliente en cada
// petición, así que retirar el rol surte efecto en la siguiente (FR-002).

export type CurrentAdmin = CurrentCustomer & { isAdmin: true };

export function isAdminCustomer(c: CurrentCustomer | null): c is CurrentAdmin {
  return c !== null && c.isAdmin === true && c.emailVerifiedAt !== null;
}

/**
 * Sin sesión: redirige a iniciar sesión con la ruta actual de vuelta. Con sesión pero sin rol o sin
 * correo verificado: el mismo 404 que una ruta inexistente (FR-003).
 */
export async function requireAdmin(): Promise<CurrentAdmin> {
  const customer = await getCurrentSession();
  if (!customer) redirect(loginUrl(await getPathname()));
  if (!isAdminCustomer(customer)) notFound();
  return customer;
}
