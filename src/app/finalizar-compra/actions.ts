'use server';

import { redirect } from 'next/navigation';
import { echoValues } from '@/domain/account-schemas';
import { actionContext } from '@/lib/account/action-context';
import { formRecord } from '@/lib/account/common';
import { getCurrentSession } from '@/lib/auth/session';
import { readCartToken } from '@/lib/cart/cookie';
import { confirmOrder as runConfirmOrder } from '@/lib/checkout/confirm';
import type { CheckoutFormState } from '@/lib/checkout/form-state';
import { assertShopEnabled, ShopDisabledError } from '@/lib/checkout/guard';
import { createSubmissionToken } from '@/lib/form-token';

/**
 * "Confirmar pedido" (contracts/routes.md). Next.js comprueba Origin frente al host (CSRF). Con
 * tarjeta, 303 a la pasarela; con pago en clínica, a la confirmación; si el carrito ha cambiado o
 * falta stock, a /carrito con el aviso (las cantidades ya se han ajustado). Un error de los datos
 * vuelve a pintar el formulario con lo escrito.
 */
export async function confirmCheckout(_prev: CheckoutFormState, form: FormData): Promise<CheckoutFormState> {
  try {
    await assertShopEnabled();
  } catch (error) {
    if (error instanceof ShopDisabledError) redirect('/');
    throw error;
  }
  const { ip, now } = await actionContext();
  const session = await getCurrentSession();
  const result = await runConfirmOrder(form, {
    ip,
    now,
    customer: session ? { id: session.id, email: session.email } : null,
    cartToken: session ? null : await readCartToken(),
  });
  const values = echoValues(formRecord(form));
  const submitted = form.get('token');
  const token = typeof submitted === 'string' && submitted.length <= 300 ? submitted : undefined;

  switch (result.status) {
    case 'ok':
    case 'cart_changed':
    case 'stock_unavailable':
    case 'empty':
      redirect(result.url);
    case 'invalid':
      return { status: 'invalid', fieldErrors: result.fieldErrors, values: result.values, token };
    case 'rate_limited':
      return { status: 'rate_limited', retryMinutes: result.retryMinutes, values, token };
    case 'limit_reached':
      return { status: 'limit_reached', values, token };
    case 'expired_token':
      return { status: 'expired', values, token: createSubmissionToken() };
    default:
      return { status: 'error', values, token };
  }
}
