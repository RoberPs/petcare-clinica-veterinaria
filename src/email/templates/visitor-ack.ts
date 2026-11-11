import type { EmailClinic, EmailMessage, OutgoingEmail } from '../types';
import { escapeHtml, layoutHtml } from './escape';

// Acuse al visitante (FR-025a): breve y SIN el texto del mensaje ni el motivo.
export function visitorAck(clinic: EmailClinic, msg: Pick<EmailMessage, 'name' | 'email'>): OutgoingEmail {
  const subject = `Hemos recibido tu mensaje — ${clinic.name}`;
  const paragraphs = [
    `Hola, ${msg.name}:`,
    `Hemos recibido tu mensaje y te responderemos ${clinic.responseTimeText}.`,
    `Si es urgente, llámanos al ${clinic.phoneDisplay}.`,
    `Horario: ${clinic.hoursSummary.join('; ')}.`,
    ...(clinic.demoBannerEnabled ? [`Esta es una web de demostración: ${clinic.name} es una clínica ficticia.`] : []),
  ];
  const privacy = `Política de privacidad: ${clinic.privacyUrl}`;

  const text = [...paragraphs, '', privacy, '', `— ${clinic.name}`].join('\n\n').replace(/\n{3,}/g, '\n\n');
  const html = layoutHtml(
    subject,
    paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('') +
      `<p><small><a href="${escapeHtml(clinic.privacyUrl)}">Política de privacidad</a></small></p>` +
      `<p>— ${escapeHtml(clinic.name)}</p>`,
  );

  return { to: { email: msg.email, name: msg.name }, subject, text, html };
}
