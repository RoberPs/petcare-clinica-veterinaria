'use server';

import { redirect } from 'next/navigation';
import { actionContext } from '@/lib/account/action-context';
import { formField } from '@/lib/account/common';
import type { LoginState } from '@/lib/account/form-state';
import { processLogin, safeReturnTo } from '@/lib/account/login';
import { clearLoginHint } from '@/lib/auth/login-hint';
import { setSessionCookie } from '@/lib/auth/session';

// Iniciar sesión (contracts/forms.md). Con éxito, 303 a return_to (si es seguro) o a /mi-cuenta.
export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const ctx = await actionContext();
  // La pista del correo solo sirve una vez (A4).
  await clearLoginHint();
  const result = await processLogin(form, ctx);
  if (result.status === 'ok') {
    await setSessionCookie(result.token, result.remember);
    redirect(safeReturnTo(formField(form, 'return_to')));
  }
  return result;
}
