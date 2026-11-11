import type { OutgoingEmail } from '../types';
import { escapeHtml, layoutHtml } from './escape';

// Piezas comunes de los correos de cuenta (contracts/emails.md): solo el nombre del cliente, enlaces
// absolutos con SITE_URL, sin imágenes remotas y con el aviso de demostración si está activo.

export interface AccountEmailContext {
  clinicName: string;
  demoBannerEnabled: boolean;
  /** SITE_URL sin la barra final. */
  siteUrl: string;
}

export interface AccountRecipient {
  email: string;
  firstName: string;
}

export type Block = { p: string } | { link: { label: string; href: string } };

export const absoluteUrl = (ctx: AccountEmailContext, path: string) => `${ctx.siteUrl}${path}`;

/** Monta el texto y el HTML a partir de los mismos bloques. Todo el contenido se escapa. */
export function buildAccountEmail(
  ctx: AccountEmailContext,
  to: AccountRecipient,
  subject: string,
  blocks: Block[],
): OutgoingEmail {
  const all: Block[] = [
    { p: `Hola, ${to.firstName}:` },
    ...blocks,
    ...(ctx.demoBannerEnabled ? [{ p: `Esta es una web de demostración: ${ctx.clinicName} es una clínica ficticia.` }] : []),
    { p: `— ${ctx.clinicName}` },
  ];
  const text = all.map((b) => ('p' in b ? b.p : `${b.link.label}: ${b.link.href}`)).join('\n\n');
  const html = layoutHtml(
    subject,
    all
      .map((b) =>
        'p' in b
          ? `<p>${escapeHtml(b.p)}</p>`
          : `<p><a href="${escapeHtml(b.link.href)}"><strong>${escapeHtml(b.link.label)}</strong></a></p>`,
      )
      .join(''),
  );
  return { to: { email: to.email, name: to.firstName }, subject, text, html };
}
