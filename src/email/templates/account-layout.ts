import type { EmailAddress, OutgoingEmail } from '../types';
import { escapeHtml, layoutHtml } from './escape';

// Piezas comunes de los correos de cuenta (contracts/emails.md): solo el nombre del cliente, enlaces
// absolutos con SITE_URL, sin imágenes remotas y con el aviso de demostración si está activo.
// La feature 003 la reutiliza para los correos de cita (tabla de datos, Reply-To y pie).

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

export type Block =
  | { p: string }
  | { link: { label: string; href: string } }
  /** Tabla de datos (etiqueta y valor), para los correos de cita. */
  | { rows: [string, string][] };

export interface BuildOptions {
  /** Saludo; por defecto "Hola, {nombre}:". null lo quita (correos a la clínica). */
  greeting?: string | null;
  replyTo?: EmailAddress;
  /** Línea antes de la firma (por ejemplo, la dirección y el teléfono de la clínica). */
  footer?: string;
}

export const absoluteUrl = (ctx: AccountEmailContext, path: string) => `${ctx.siteUrl}${path}`;

function blockText(b: Block): string {
  if ('p' in b) return b.p;
  if ('link' in b) return `${b.link.label}: ${b.link.href}`;
  return b.rows.map(([k, v]) => `${k}: ${v}`).join('\n');
}

function blockHtml(b: Block): string {
  if ('p' in b) return `<p>${escapeHtml(b.p)}</p>`;
  if ('link' in b) return `<p><a href="${escapeHtml(b.link.href)}"><strong>${escapeHtml(b.link.label)}</strong></a></p>`;
  return `<table>${b.rows.map(([k, v]) => `<tr><th align="left">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>`;
}

/** Monta el texto y el HTML a partir de los mismos bloques. Todo el contenido se escapa. */
export function buildAccountEmail(
  ctx: AccountEmailContext,
  to: AccountRecipient,
  subject: string,
  blocks: Block[],
  options: BuildOptions = {},
): OutgoingEmail {
  const greeting = options.greeting === undefined ? `Hola, ${to.firstName}:` : options.greeting;
  const all: Block[] = [
    ...(greeting ? [{ p: greeting }] : []),
    ...blocks,
    ...(ctx.demoBannerEnabled ? [{ p: `Esta es una web de demostración: ${ctx.clinicName} es una clínica ficticia.` }] : []),
    ...(options.footer ? [{ p: options.footer }] : []),
    { p: `— ${ctx.clinicName}` },
  ];
  return {
    to: { email: to.email, name: to.firstName },
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    subject,
    text: all.map(blockText).join('\n\n'),
    html: layoutHtml(subject, all.map(blockHtml).join('')),
  };
}
