'use server';

import { redirect } from 'next/navigation';
import { actionContext } from '@/lib/account/action-context';
import { formField } from '@/lib/account/common';
import type { LoginState } from '@/lib/account/form-state';
import { processLogin, safeReturnTo } from '@/lib/account/login';
import { clearLoginHint } from '@/lib/auth/login-hint';
import { setSessionCookie } from '@/lib/auth/session';
import { clearCartCookie, readCartToken } from '@/lib/cart/cookie';
import { mergeGuestCart } from '@/lib/cart/merge';
import { logger } from '@/lib/logger';

// Iniciar sesión (contracts/forms.md). Con éxito, 303 a return_to (si es seguro) o a /mi-cuenta.
export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const ctx = await actionContext();
  // La pista del correo solo sirve una vez (A4).
  await clearLoginHint();
  const result = await processLogin(form, ctx);
  if (result.status === 'ok') {
    await setSessionCookie(result.token, result.remember);
    // Feature 005 (D3): el carrito de invitado pasa a la cuenta. Un fallo no impide iniciar sesión.
    const cartToken = await readCartToken();
    if (cartToken) {
      try {
        await mergeGuestCart(result.customerId, cartToken);
        await clearCartCookie();
      } catch (error) {
        logger.error({ event: 'cart_merge_failed', code: error instanceof Error ? error.message.slice(0, 80) : 'unknown' });
      }
    }
    redirect(safeReturnTo(formField(form, 'return_to')));
  }
  return result;
}
