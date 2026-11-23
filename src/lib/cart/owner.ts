import type { CartOwner } from '@/db/queries/cart';
import { getCurrentSession, type CurrentCustomer } from '@/lib/auth/session';
import { hashCartToken, readCartToken } from './cookie';

/** Dueño del carrito de la petición: el cliente con sesión o el navegador con pc_cart; si no, null. */
export async function currentCartOwner(): Promise<{ owner: CartOwner | null; customer: CurrentCustomer | null }> {
  const customer = await getCurrentSession();
  if (customer) return { owner: { customerId: customer.id }, customer };
  const token = await readCartToken();
  return { owner: token ? { tokenHash: hashCartToken(token) } : null, customer: null };
}
