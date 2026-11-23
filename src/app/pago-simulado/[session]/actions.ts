'use server';

import { notFound, redirect } from 'next/navigation';
import { isShopEnabled } from '@/db/queries/checkout-config';
import { paymentBySession } from '@/db/queries/orders';
import { formField } from '@/lib/account/common';
import { getNow } from '@/lib/clock';
import { getEnv } from '@/lib/env';
import { signOrderRef } from '@/lib/orders/access';
import { emitFakeEvent, fakeCompletedEvent, isFakeSession } from '@/lib/payments/fake';

// Botones de la pasarela simulada (D2). Solo existen con PAYMENT_PROVIDER=fake: el middleware da
// 404 en la página, pero la acción se comprueba aquí también porque se puede enviar a mano.

async function openPayment(form: FormData) {
  if (getEnv().PAYMENT_PROVIDER !== 'fake' || !(await isShopEnabled())) notFound();
  const sessionId = formField(form, 'session') ?? '';
  if (!isFakeSession(sessionId)) notFound();
  const payment = await paymentBySession(sessionId);
  if (!payment) notFound();
  return payment;
}

/** "Pagar": emite el evento firmado de pago completado y vuelve a la confirmación, como Stripe. */
export async function payFake(form: FormData): Promise<void> {
  const payment = await openPayment(form);
  const now = await getNow();
  if (payment.status === 'open' && payment.expiresAt.getTime() > now.getTime()) {
    await emitFakeEvent(fakeCompletedEvent(payment.providerSessionId, payment.amountCents, payment.orderId), { now });
  }
  redirect(`/pedido/confirmado?ref=${encodeURIComponent(signOrderRef(payment.orderId, now))}`);
}

/** "Simular rechazo": la pasarela se queda en su página con el error, sin tocar el pedido. */
export async function declineFake(form: FormData): Promise<void> {
  const payment = await openPayment(form);
  redirect(`/pago-simulado/${payment.providerSessionId}?resultado=rechazada`);
}

/** "Cancelar": vuelve a la tienda por la URL de cancelación. */
export async function cancelFake(form: FormData): Promise<void> {
  const payment = await openPayment(form);
  redirect(`/pedido/pago-no-completado?ref=${encodeURIComponent(signOrderRef(payment.orderId, await getNow()))}`);
}
