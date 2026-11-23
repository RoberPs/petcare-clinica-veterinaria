import { formatDateTime } from '@/domain/time';
import type { OutgoingEmail } from '../types';
import { absoluteUrl, buildAccountEmail, type AccountEmailContext } from './account-layout';
import { newsletterFooter } from './newsletter-footer';

// newsletter_confirm (contracts/emails.md): doble confirmación del alta desde el formulario. Saludo
// genérico: del visitante solo se conoce la dirección, que no se copia en el cuerpo.
export function newsletterConfirmEmail(
  ctx: AccountEmailContext,
  data: { email: string; subscriptionId: string; token: string; expiresAt: Date },
): OutgoingEmail {
  const link = absoluteUrl(ctx, `/boletin/confirmar?t=${encodeURIComponent(data.token)}`);
  const footer = newsletterFooter(ctx, data.subscriptionId);
  const email = buildAccountEmail(
    ctx,
    { email: data.email, firstName: '' },
    `Confirma tu suscripción al boletín de ${ctx.clinicName}`,
    [
      { p: 'Para recibir el boletín, confirma tu correo:' },
      { link: { label: 'Confirmar suscripción', href: link } },
      {
        p: `El enlace caduca el ${formatDateTime(data.expiresAt)}. Si no lo pediste, ignora este correo: sin confirmar no te enviaremos nada y borraremos tu dirección en 30 días.`,
      },
      { p: 'Puedes leer cómo tratamos tus datos en la política del boletín:' },
      { link: { label: 'Política del boletín', href: absoluteUrl(ctx, '/politica-del-boletin') } },
      ...footer.blocks,
    ],
    { greeting: 'Hola:' },
  );
  return { ...email, to: { email: data.email }, headers: footer.headers };
}
