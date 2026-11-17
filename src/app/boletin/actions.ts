'use server';

import { redirect } from 'next/navigation';
import { safeNewsletterReturnTo } from '@/domain/newsletter-schemas';
import { sendEmailsNow } from '@/email/outbox';
import { actionContext } from '@/lib/account/action-context';
import { formField } from '@/lib/account/common';
import { confirmSubscription } from '@/lib/newsletter/confirm';
import { resendConfirmation, subscribe, type NewsletterFormState } from '@/lib/newsletter/subscribe';
import { unsubscribeWithToken } from '@/lib/newsletter/unsubscribe';
import { withNotice } from '@/lib/notice';

// Server Actions del boletín (contracts/routes.md). Next.js comprueba Origin frente al host (CSRF).
// Con y sin JavaScript, un envío correcto redirige con 303 (POST-Redirect-GET).

export async function subscribeNewsletter(_prev: NewsletterFormState, form: FormData): Promise<NewsletterFormState> {
  const { result, outboxIds } = await subscribe(form, await actionContext());
  sendEmailsNow(outboxIds);
  if (result.status === 'ok') {
    redirect(`${withNotice(safeNewsletterReturnTo(formField(form, 'return_to')), 'boletin-revisa-correo')}#boletin`);
  }
  return result;
}

/** "Pedir otro enlace" desde la página de enlace caducado: mismo mensaje uniforme. */
export async function resendNewsletterConfirmation(_prev: NewsletterFormState, form: FormData): Promise<NewsletterFormState> {
  const { result, outboxIds } = await resendConfirmation(form, await actionContext());
  sendEmailsNow(outboxIds);
  if (result.status === 'ok') redirect('/boletin/confirmar?estado=reenviado');
  return result;
}

export async function confirmNewsletter(form: FormData): Promise<void> {
  const result = await confirmSubscription(formField(form, 't'), (await actionContext()).now);
  redirect(`/boletin/confirmar?estado=${result === 'ok' ? 'ok' : result === 'already' ? 'ya' : result === 'error' ? 'error' : 'invalido'}`);
}

export async function unsubscribeNewsletter(form: FormData): Promise<void> {
  const result = await unsubscribeWithToken(formField(form, 't'), 'link', (await actionContext()).now);
  redirect(`/boletin/baja?estado=${result === 'ok' ? 'ok' : result === 'already' ? 'ya' : result === 'error' ? 'error' : 'invalido'}`);
}
