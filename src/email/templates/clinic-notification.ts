import { formatDateTime } from '@/domain/time';
import type { EmailClinic, EmailMessage, OutgoingEmail } from '../types';
import { escapeHtml, layoutHtml, nl2br } from './escape';

// Correo a la clínica (contracts/consent-and-email.md): todos los datos y Reply-To al visitante.
export function clinicNotification(clinic: EmailClinic, msg: EmailMessage): OutgoingEmail {
  const subject = `[Web] ${msg.reasonLabel} — ${msg.name}`.replace(/[\r\n]+/g, ' ');
  const when = formatDateTime(msg.createdAt);
  const phone = msg.phone ?? 'no indicado';
  const footer = `Mensaje recibido desde el formulario de contacto de ${clinic.name}`;

  const text = [
    `Nombre: ${msg.name}`,
    `Teléfono: ${phone}`,
    `Correo: ${msg.email}`,
    `Motivo: ${msg.reasonLabel}`,
    `Fecha: ${when} (hora de Madrid)`,
    '',
    'Mensaje:',
    msg.message,
    '',
    '—',
    footer,
  ].join('\n');

  const row = (label: string, value: string) =>
    `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
  const html = layoutHtml(
    subject,
    `<table>${row('Nombre', msg.name)}${row('Teléfono', phone)}${row('Correo', msg.email)}${row('Motivo', msg.reasonLabel)}${row('Fecha', `${when} (hora de Madrid)`)}</table>` +
      `<h2>Mensaje</h2><p>${nl2br(msg.message)}</p><hr><p><small>${escapeHtml(footer)}</small></p>`,
  );

  return {
    to: { email: clinic.inboxEmail, name: clinic.name },
    replyTo: { email: msg.email, name: msg.name },
    subject,
    text,
    html,
  };
}
