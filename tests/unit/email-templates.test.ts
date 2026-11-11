import { describe, expect, it } from 'vitest';
import { clinicNotification } from '@/email/templates/clinic-notification';
import { visitorAck } from '@/email/templates/visitor-ack';
import type { EmailClinic, EmailMessage } from '@/email/types';

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
