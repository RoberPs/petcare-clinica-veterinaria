import { getCheckoutSettings } from '@/db/queries/checkout-config';
import { getCustomerOrder, getOrder, type OrderRow } from '@/db/queries/orders';
import { getCurrentSession } from '@/lib/auth/session';
import { guestLinkValid, verifyGuestToken, verifyOrderRef } from './access';

// Cómo se identifica un pedido sin exponer su id (D18): la ref de 2 h de la vuelta de la pasarela,
// el número con la sesión de su dueño (US5) o el token del enlace privado de invitado (US6).

export type GuestLookup = { status: 'ok'; order: OrderRow } | { status: 'expired' } | { status: 'not_found' };

/** Pedido del enlace de invitado: firma válida, misma access_version y dentro de guest_link_days. */
export async function findGuestOrder(token: unknown, now: Date): Promise<GuestLookup> {
  const parsed = verifyGuestToken(token);
  if (!parsed) return { status: 'not_found' };
  const order = await getOrder(parsed.orderId);
  // Solo pedidos de invitado: un pedido con cuenta se ve en "Mis pedidos".
  if (!order || order.customerId !== null || order.accessVersion !== parsed.version || order.anonymizedAt) {
    return { status: 'not_found' };
  }
  const settings = await getCheckoutSettings();
  if (!settings || !guestLinkValid(order.lastStatusAt, settings.guestLinkDays, now)) return { status: 'expired' };
  return { status: 'ok', order };
}

export interface FormOrder {
  order: OrderRow | null;
  /** Página a la que vuelven las acciones (la misma desde la que se enviaron). */
  backUrl: string;
}

/** Pedido al que apunta un formulario de acción (ref, numero o token). */
export async function orderFromForm(get: (name: string) => string | null, now: Date): Promise<FormOrder> {
  const numero = get('numero');
  if (numero) {
    const customer = await getCurrentSession();
    const order = customer ? await getCustomerOrder(customer.id, numero) : null;
    return { order, backUrl: `/mi-cuenta/pedidos/${encodeURIComponent(numero)}` };
  }
  const token = get('token');
  if (token) {
    const found = await findGuestOrder(token, now);
    return { order: found.status === 'ok' ? found.order : null, backUrl: `/pedido/${encodeURIComponent(token)}` };
  }
  const ref = get('ref') ?? '';
  const orderId = verifyOrderRef(ref, now);
  return {
    order: orderId ? await getOrder(orderId) : null,
    backUrl: `/pedido/pago-no-completado?ref=${encodeURIComponent(ref)}`,
  };
}
