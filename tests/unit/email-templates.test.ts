import { describe, expect, it } from 'vitest';
import { clinicNotification } from '@/email/templates/clinic-notification';
import { visitorAck } from '@/email/templates/visitor-ack';
import type { EmailClinic, EmailMessage } from '@/email/types';
import type { AccountEmailContext } from '@/email/templates/account-layout';
import { accountExists } from '@/email/templates/account-exists';
import { verifyEmail } from '@/email/templates/verify-email';
import { accountDeleted } from '@/email/templates/account-deleted';
import { passwordChanged } from '@/email/templates/password-changed';
import { passwordReset } from '@/email/templates/password-reset';

const clinic: EmailClinic = {
  name: 'PetCare',
  inboxEmail: 'buzon@example.test',
  phoneDisplay: '600 00 00 00',
  phoneE164: '+34600000000',
  responseTimeText: 'en un plazo de 24 horas laborables',
  demoBannerEnabled: true,
  hoursSummary: ['Lunes a viernes: 09:30–14:00', 'Sábado: cerrado'],
  privacyUrl: 'https://petcare.example/privacidad',
};

const msg: EmailMessage = {
  name: 'Ana <script>',
  phone: null,
  email: 'ana@example.test',
  reasonLabel: 'Consulta sobre una cita',
  message: 'Hola & <b>adiós</b>\nsegunda línea',
  createdAt: new Date('2026-11-10T12:05:00Z'),
};

describe('plantillas de correo', () => {
  it('clinic_notification incluye todos los datos, la fecha en Madrid y Reply-To', () => {
    const e = clinicNotification(clinic, msg);
    expect(e.to.email).toBe('buzon@example.test');
    expect(e.replyTo?.email).toBe('ana@example.test');
    expect(e.subject).toBe('[Web] Consulta sobre una cita — Ana <script>');
    for (const part of ['Ana <script>', 'no indicado', 'ana@example.test', 'Consulta sobre una cita', '10/11/2026 13:05', 'segunda línea']) {
      expect(e.text).toContain(part);
    }
    expect(e.text).toContain('Mensaje recibido desde el formulario de contacto de PetCare');
  });

  it('clinic_notification escapa todo el HTML', () => {
    const { html } = clinicNotification(clinic, msg);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>adiós</b>');
    expect(html).toContain('Ana &lt;script&gt;');
    expect(html).toContain('Hola &amp; &lt;b&gt;adiós&lt;/b&gt;<br>segunda línea');
  });

  it('visitor_ack no incluye el mensaje ni el motivo y sí el plazo, el teléfono y el aviso de demo', () => {
    const e = visitorAck(clinic, msg);
    expect(e.to.email).toBe('ana@example.test');
    expect(e.subject).toBe('Hemos recibido tu mensaje — PetCare');
    for (const body of [e.text, e.html]) {
      expect(body).not.toContain('adiós');
      expect(body).not.toContain('Consulta sobre una cita');
      expect(body).toContain('en un plazo de 24 horas laborables');
      expect(body).toContain('600 00 00 00');
      expect(body).toContain('Esta es una web de demostración: PetCare es una clínica ficticia.');
      expect(body).toContain('https://petcare.example/privacidad');
    }
    expect(e.html).not.toContain('<script>');
  });

  it('sin franja de demo, el acuse no menciona la demostración', () => {
    const e = visitorAck({ ...clinic, demoBannerEnabled: false }, msg);
    expect(e.text).not.toContain('demostración');
  });
});

// ---------- Correos de cuenta (feature 002, contracts/emails.md) ----------

const ctx: AccountEmailContext = { clinicName: 'PetCare & Co', demoBannerEnabled: true, siteUrl: 'https://petcare.example' };
const ana = { email: 'ana@example.test', firstName: 'Ana <b>' };
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';

/** Comprobaciones comunes: escapado, aviso de demo y ningún dato aparte del nombre. */
function expectSafeAccountEmail(e: { to: { email: string }; text: string; html: string }) {
  expect(e.to.email).toBe('ana@example.test');
  expect(e.html).toContain('Ana &lt;b&gt;');
  expect(e.html).not.toContain('<b>Ana');
  expect(e.html).toContain('PetCare &amp; Co');
  expect(e.text).toContain('Esta es una web de demostración');
  // Solo el nombre: ni el correo en el cuerpo, ni teléfono, ni contraseña.
  expect(e.text).not.toContain('ana@example.test');
  expect(e.html).not.toContain('ana@example.test');
  expect(e.html).not.toMatch(/<img/i);
}

describe('plantillas de cuenta (US1)', () => {
  it('verify_email lleva el enlace absoluto con el token, la caducidad y el "si no has sido tú"', () => {
    const e = verifyEmail(ctx, ana, TOKEN);
    expect(e.subject).toBe('Confirma tu correo en PetCare & Co');
    expect(e.text).toContain(`https://petcare.example/verificar-correo?token=${TOKEN}`);
    expect(e.html).toContain(`href="https://petcare.example/verificar-correo?token=${TOKEN}"`);
    expect(e.text).toContain('24 horas');
    expect(e.text).toContain('ignora este correo');
    expectSafeAccountEmail(e);
  });

  it('account_exists enlaza a iniciar sesión y a recuperar la contraseña, sin token', () => {
    const e = accountExists(ctx, ana);
    expect(e.subject).toBe('Ya tienes una cuenta en PetCare & Co');
    expect(e.text).toContain('https://petcare.example/iniciar-sesion');
    expect(e.text).toContain('https://petcare.example/recuperar-contrasena');
    expect(e.text).not.toContain('token=');
    expectSafeAccountEmail(e);
  });

  it('sin la franja de demo no se menciona la demostración', () => {
    expect(verifyEmail({ ...ctx, demoBannerEnabled: false }, ana, TOKEN).text).not.toContain('demostración');
  });
});

describe('plantillas de cuenta (US5)', () => {
  it('password_reset lleva el enlace de 1 hora y dice que la contraseña no cambia si no lo pediste', () => {
    const e = passwordReset(ctx, ana, TOKEN);
    expect(e.subject).toBe('Restablece tu contraseña de PetCare & Co');
    expect(e.text).toContain(`https://petcare.example/restablecer-contrasena?token=${TOKEN}`);
    expect(e.text).toContain('1 hora');
    expect(e.text).toContain('tu contraseña no cambia');
    expectSafeAccountEmail(e);
  });

  it('password_changed lleva la fecha y la hora en Europe/Madrid y el enlace para restablecerla', () => {
    const e = passwordChanged(ctx, ana, new Date('2026-07-10T22:30:00Z'));
    expect(e.subject).toBe('Tu contraseña de PetCare & Co ha cambiado');
    expect(e.text).toContain('11/07/2026 00:30');
    expect(e.text).toContain('https://petcare.example/recuperar-contrasena');
    expect(e.text).not.toContain('token=');
    expectSafeAccountEmail(e);
  });
});

describe('plantillas de cuenta (US7)', () => {
  it('account_deleted confirma el borrado, sin enlaces ni datos', () => {
    const e = accountDeleted(ctx, ana);
    expect(e.subject).toBe('Hemos eliminado tu cuenta de PetCare & Co');
    expect(e.text).toContain('no se puede deshacer');
    expect(e.text).not.toContain('https://');
    expect(e.html).not.toContain('<a ');
    expectSafeAccountEmail(e);
  });
});

