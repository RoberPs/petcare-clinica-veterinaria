'use server';

import { redirect } from 'next/navigation';
import { formField } from '@/lib/account/common';
import { ensureCheckoutSession } from '@/lib/checkout/confirm';
import { assertShopEnabled, ShopDisabledError } from '@/lib/checkout/guard';
import { getNow } from '@/lib/clock';
import { logger } from '@/lib/logger';
import { withNotice } from '@/lib/notice';
import { cancelOrder as runCancelOrder } from '@/lib/orders/cancel';
import { orderFromForm } from '@/lib/orders/locate';

// Acciones sobre un pedido pendiente (contracts/routes.md). El pedido se identifica con la ref
// firmada de 2 h (vuelta de la pasarela), el número con la sesión de su dueño ("Mis pedidos") o el
// token del enlace de invitado; nunca con el id. Cada acción vuelve a la página desde la que se envió.

async function guard(): Promise<void> {
  try {
    await assertShopEnabled();
  } catch (error) {
    if (error instanceof ShopDisabledError) redirect('/');
    throw error;
  }
}

/** "Reintentar pago": vuelve a la pasarela mientras la reserva siga vigente. */
export async function retryPayment(form: FormData): Promise<void> {
  await guard();
  const now = await getNow();
  const { order, backUrl } = await orderFromForm((n) => formField(form, n) ?? null, now);
  if (!order) redirect(formField(form, 'ref') ? '/carrito' : backUrl);
  const payable =
    order.paymentMethod === 'card' &&
    order.status === 'pending_payment' &&
    order.reservationExpiresAt !== null &&
    order.reservationExpiresAt.getTime() > now.getTime();
  if (!payable) redirect(withNotice(backUrl, 'pago-vencido'));
  let url: string;
  try {
    url = await ensureCheckoutSession(order, now);
  } catch (error) {
    logger.error({ event: 'payment_retry_failed', order_id: order.id, code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
    redirect(withNotice(backUrl, 'carrito-error'));
  }
  redirect(url);
}

/** "Cancelar pedido" (con el paso de confirmación): solo un pedido pendiente de pago. */
export async function cancelPendingOrder(form: FormData): Promise<void> {
  await guard();
  const now = await getNow();
  const { order, backUrl } = await orderFromForm((n) => formField(form, n) ?? null, now);
  if (!order) redirect(formField(form, 'ref') ? '/carrito' : backUrl);
  if (formField(form, 'confirm') !== 'si') redirect(backUrl);
  if (order.status !== 'pending_payment') redirect(withNotice(backUrl, 'pedido-no-cancelable'));
  await runCancelOrder(order.id, 'customer', { reason: 'customer', now });
  redirect(withNotice(backUrl, 'pedido-cancelado'));
}
