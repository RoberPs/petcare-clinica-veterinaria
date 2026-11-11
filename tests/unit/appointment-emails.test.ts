import { describe, expect, it } from 'vitest';
import type { EmailContext } from '@/email/outbox';
import { appointmentCancelled } from '@/email/templates/appointment-cancelled';
import { appointmentChanged } from '@/email/templates/appointment-changed';
import type { AppointmentEmailData } from '@/email/templates/appointment-common';
import { appointmentConfirmed } from '@/email/templates/appointment-confirmed';
import { appointmentReminder } from '@/email/templates/appointment-reminder';
import { clinicAppointment } from '@/email/templates/clinic-appointment';

const ctx: EmailContext = {
  clinicName: 'PetCare',
  demoBannerEnabled: true,
  siteUrl: 'https://petcare.example',
  clinicAddress: 'Calle de Prueba 1, 28000 Madrid',
  clinicPhone: '600 00 00 00',
  inboxEmail: 'buzon@example.test',
};

const data: AppointmentEmailData = {
  contactName: 'Ana <b>Prueba</b>',
  contactEmail: 'ana@example.test',
  contactPhone: '600 123 456',
  serviceName: 'Consulta general',
  staffName: 'Dra. Prueba',
  petName: 'Lúa & <i>co</i>',
  petSpeciesLabel: 'Perro',
  // Martes 17/11/2026, 10:00 en Madrid.
  startsAt: new Date('2026-11-17T09:00:00Z'),
  reason: 'Motivo PRIVADO <script>',
  bookedAs: 'guest',
};

function expectSafe(e: { html: string; text: string }) {
  expect(e.html).not.toContain('<script>');
  expect(e.html).not.toContain('<b>Prueba</b>');
  expect(e.html).toContain('Lúa &amp; &lt;i&gt;co&lt;/i&gt;');
  expect(e.text.length).toBeGreaterThan(50);
  expect(e.text).not.toContain('<p>');
}

describe('appointment_confirmed', () => {
  it('invitado: datos de la cita, teléfono y plazo; sin el motivo', () => {
    const e = appointmentConfirmed(ctx, data, { variant: 'guest', cutoffHours: 24 });
    expect(e.to.email).toBe('ana@example.test');
    expect(e.subject).toBe('Tu cita en PetCare está confirmada');
    for (const part of ['Consulta general', 'Dra. Prueba', 'Lúa & <i>co</i> (Perro)', 'martes, 17 de noviembre de 2026', '10:00', 'Calle de Prueba 1, 28000 Madrid']) {
      expect(e.text).toContain(part);
    }
    expect(e.text).toContain('Para cancelar o cambiar la cita, llámanos al 600 00 00 00, a ser posible con 24 horas de antelación.');
    expect(e.text).not.toContain('PRIVADO');
    expect(e.html).not.toContain('PRIVADO');
    expect(e.text).not.toContain('inicia sesión');
    expect(e.text).not.toContain('/mi-cuenta/citas');
    expectSafe(e);
  });

  it('invitado con cuenta: sugiere iniciar sesión', () => {
    const e = appointmentConfirmed(ctx, data, { variant: 'guest', cutoffHours: 24, hasAccount: true });
    expect(e.text).toContain('La próxima vez, inicia sesión para ver tus citas en tu cuenta.');
  });

  it('cliente: "Mis citas" con el enlace y el plazo', () => {
    const e = appointmentConfirmed(ctx, { ...data, bookedAs: 'customer' }, { variant: 'customer', cutoffHours: 24 });
    expect(e.text).toContain('Puedes cancelarla o cambiarla desde Mis citas hasta 24 horas antes.');
    expect(e.text).toContain('https://petcare.example/mi-cuenta/citas');
    expect(e.html).toContain('href="https://petcare.example/mi-cuenta/citas"');
  });
});

describe('clinic_appointment', () => {
  const manageUrl = 'https://petcare.example/gestion-cita/abc.def';

  it('nueva: todos los datos, el motivo, el tipo y el enlace de gestión', () => {
    const e = clinicAppointment(ctx, data, { action: 'new', manageUrl });
    expect(e.to.email).toBe('buzon@example.test');
    expect(e.replyTo?.email).toBe('ana@example.test');
    expect(e.subject).toBe('Cita nueva: 17/11/2026 10:00, Consulta general');
    for (const part of ['Invitado (sin cuenta)', 'Ana <b>Prueba</b>', '600 123 456', 'ana@example.test', 'Motivo PRIVADO <script>', manageUrl]) {
      expect(e.text).toContain(part);
    }
    expect(e.text).toContain('Úsalo solo para atender a quien llame; no lo reenvíes.');
    expect(e.text).not.toMatch(/^Hola/);
    expectSafe(e);
  });

  it('cambiada: la fecha anterior y el enlace nuevo', () => {
    const e = clinicAppointment(ctx, data, { action: 'changed', manageUrl, previousStartsAt: new Date('2026-11-16T15:30:00Z') });
    expect(e.subject).toMatch(/^Cita cambiada:/);
    expect(e.text).toContain('La cita del lunes, 16 de noviembre de 2026 a las 16:30 ha cambiado a:');
    expect(e.text).toContain(manageUrl);
  });

  it('cancelada: quién la ha cancelado y sin enlace de gestión', () => {
    const e = clinicAppointment(ctx, data, { action: 'cancelled', manageUrl, cancelledBy: 'system' });
    expect(e.subject).toMatch(/^Cita cancelada:/);
    expect(e.text).toContain('al eliminar el cliente su cuenta');
    expect(e.text).not.toContain('gestion-cita');
  });

  it('el asunto no admite saltos de línea', () => {
    const e = clinicAppointment(ctx, { ...data, serviceName: 'Consulta\r\nBcc: x@example.test' }, { action: 'new', manageUrl });
    expect(e.subject).not.toMatch(/[\r\n]/);
  });
});

describe('appointment_changed', () => {
  it('lleva la fecha anterior, la nueva y las instrucciones; sin el motivo', () => {
    const e = appointmentChanged(ctx, data, { previousStartsAt: new Date('2026-11-16T15:30:00Z'), variant: 'guest', cutoffHours: 24 });
    expect(e.subject).toBe('Hemos cambiado tu cita en PetCare');
    expect(e.text).toContain('Tu cita del lunes, 16 de noviembre de 2026 a las 16:30 ha cambiado.');
    expect(e.text).toContain('martes, 17 de noviembre de 2026');
    expect(e.text).toContain('llámanos al 600 00 00 00');
    expect(e.text).not.toContain('PRIVADO');
    expectSafe(e);
  });
});

describe('appointment_cancelled', () => {
  it('cliente: "Has cancelado esta cita" y el enlace a Pide cita', () => {
    const e = appointmentCancelled(ctx, data, { by: 'customer' });
    expect(e.subject).toBe('Tu cita en PetCare se ha cancelado');
    expect(e.text).toContain('Has cancelado esta cita');
    expect(e.text).toContain('https://petcare.example/pide-cita');
    expect(e.text).not.toContain('PRIVADO');
    expectSafe(e);
  });

  it('clínica: "La clínica ha cancelado esta cita" con el teléfono', () => {
    const e = appointmentCancelled(ctx, data, { by: 'clinic' });
    expect(e.text).toContain('La clínica ha cancelado esta cita');
    expect(e.text).toContain('600 00 00 00');
  });
});

describe('appointment_reminder', () => {
  it('invitado: datos de la cita e instrucciones; sin el motivo', () => {
    const e = appointmentReminder(ctx, data, { variant: 'guest', cutoffHours: 24 });
    expect(e.subject).toBe('Recordatorio: tu cita en PetCare es el martes, 17 de noviembre de 2026 a las 10:00');
    expect(e.text).toContain('Consulta general');
    expect(e.text).toContain('llámanos al 600 00 00 00');
    expect(e.text).not.toContain('PRIVADO');
    expectSafe(e);
  });

  it('cliente: el enlace a Mis citas', () => {
    const e = appointmentReminder(ctx, { ...data, bookedAs: 'customer' }, { variant: 'customer', cutoffHours: 24 });
    expect(e.text).toContain('https://petcare.example/mi-cuenta/citas');
  });
});
