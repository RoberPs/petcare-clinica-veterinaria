'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { readCartToken, setCartCookie } from '@/lib/cart/cookie';
import {
  processAddToCart,
  processApplyDiscount,
  processBuyNow,
  processRemoveCartLine,
  processRemoveDiscount,
  processUpdateCartLine,
  type CartActionContext,
  type CartOutcome,
  type DiscountResult,
} from '@/lib/cart/flows';
import { getClientIp } from '@/lib/client-ip';
import { getNow } from '@/lib/clock';
import { getEnv } from '@/lib/env';
import { withNotice } from '@/lib/notice';

// Server Actions del carrito (contracts/routes.md): PRG con 303 y aviso en ?aviso=. La guarda de
// la tienda (assertShopEnabled) va dentro de cada flujo, porque estas acciones también se envían
// desde /productos y el 404 del middleware no las cubre.

async function context(): Promise<CartActionContext> {
  const session = await getCurrentSession();
  return { customerId: session?.id ?? null, cartToken: session ? null : await readCartToken() };
}

async function finish(outcome: CartOutcome): Promise<never> {
  if (outcome.newToken) await setCartCookie(outcome.newToken, outcome.retentionDays);
  redirect(outcome.redirectTo);
}

export async function addToCart(form: FormData): Promise<void> {
  await finish(await processAddToCart(form, await context()));
}

/** "Comprar ahora" en la ficha (US8): mismo formulario que "Añadir al carrito", con formAction. */
export async function buyNow(form: FormData): Promise<void> {
  await finish(await processBuyNow(form, await context()));
}

export async function updateCartLine(form: FormData): Promise<void> {
  await finish(await processUpdateCartLine(form, await context()));
}

export async function removeCartLine(form: FormData): Promise<void> {
  await finish(await processRemoveCartLine(form, await context()));
}

export async function applyDiscount(_prev: DiscountResult | { status: 'idle' }, form: FormData): Promise<DiscountResult> {
  const result = await processApplyDiscount(form, {
    ...(await context()),
    ip: getClientIp(await headers(), getEnv().trustedProxyIps),
    now: await getNow(),
  });
  if (result.status === 'ok') redirect(withNotice('/carrito', 'descuento-aplicado'));
  return result;
}

export async function removeDiscount(): Promise<void> {
  await finish(await processRemoveDiscount(await context()));
}
