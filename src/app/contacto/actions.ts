'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { dispatchForMessage } from '@/email/dispatch';
import { getClientIp } from '@/lib/client-ip';
import { processContactSubmission, type ContactResult } from '@/lib/contact-submission';
import { getEnv } from '@/lib/env';

/**
 * Server Action del formulario de contacto. Next.js comprueba Origin frente al host (CSRF).
 * Sin JavaScript (no llega el campo "js"), un envío correcto redirige a /contacto/enviado (PRG).
 */
export async function submitContact(_prev: ContactResult, form: FormData): Promise<ContactResult> {
  const ip = getClientIp(await headers(), getEnv().trustedProxyIps);
  const { result, newMessageId } = await processContactSubmission(form, { ip });
  if (newMessageId) after(() => dispatchForMessage(newMessageId));
  if (result.status === 'ok' && form.get('js') !== '1') redirect('/contacto/enviado');
  return result;
}
