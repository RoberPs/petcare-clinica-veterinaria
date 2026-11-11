import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { rescheduleOwn } from '@/lib/booking/reschedule';
import { enqueueDueReminders } from '@/lib/booking/reminders';
import { createAppointment, createCustomer, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Recordatorio por correo (B17, FR-034). Hora fija: lunes 16/11/2026 a las 09:00 (Madrid).

const NOW = madrid('2026-11-16', '09:00');
const hoursAfter = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const reminders = () => q("SELECT appointment_id, payload FROM email_outbox WHERE kind = 'appointment_reminder'");

describe('recordatorios de cita', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedBookingConfig();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('encola el recordatorio y marca reminder_sent_at para las que empiezan dentro de 24 h', async () => {
    const soon = await createAppointment({ staff: 'nerea-olmedo', startsAt: hoursAfter(23), contactEmail: 'pronto@example.test', reason: 'Privado' });
    const later = await createAppointment({ staff: 'nerea-olmedo', startsAt: hoursAfter(30) });
    const cancelled = await createAppointment({ staff: 'inigo-barral', startsAt: hoursAfter(23), status: 'cancelled' });
    // Reservada hace 1 h para dentro de 22 h (23 h de antelación): menos que las 24 configuradas.
    const late = await createAppointment({ staff: 'inigo-barral', startsAt: hoursAfter(22), createdAt: hoursAfter(-1) });
    const ids = await enqueueDueReminders(getDb(), NOW);
    expect(ids).toHaveLength(1);
    const [mail] = await reminders();
    expect(mail!.appointment_id).toBe(soon.id);
    expect(mail!.payload.to.email).toBe('pronto@example.test');
    expect(mail!.payload.subject).toMatch(/^Recordatorio: tu cita en PetCare es el /);
    expect(mail!.payload.text).not.toContain('Privado');
    const marked = new Map((await q('SELECT id, reminder_sent_at FROM appointments')).map((r) => [r.id, r.reminder_sent_at]));
    expect(marked.get(soon.id)).not.toBeNull();
    for (const id of [later.id, cancelled.id, late.id]) expect(marked.get(id)).toBeNull();
  });

  it('no vuelve a recordar una cita ya recordada', async () => {
    await createAppointment({ startsAt: hoursAfter(10) });
    expect(await enqueueDueReminders(getDb(), NOW)).toHaveLength(1);
    expect(await enqueueDueReminders(getDb(), hoursAfter(1))).toHaveLength(0);
    expect(await reminders()).toHaveLength(1);
  });

  it('dos pasadas simultáneas no duplican ningún recordatorio', async () => {
    for (let i = 0; i < 5; i++) await createAppointment({ staff: i % 2 ? 'inigo-barral' : 'nerea-olmedo', startsAt: hoursAfter(2 + i) });
    const [a, b] = await Promise.all([enqueueDueReminders(getDb(), NOW), enqueueDueReminders(getDb(), NOW)]);
    expect(a.length + b.length).toBe(5);
    expect(await reminders()).toHaveLength(5);
  });

  it('tras un cambio de cita vuelve a recordar la nueva hora', async () => {
    const c = await createCustomer();
    const a = await createAppointment({ customerId: c.id, staff: 'nerea-olmedo', service: 'consulta-general', startsAt: madrid('2026-11-17', '12:00') });
    // Martes 08:00: faltan 4 h, se recuerda.
    expect(await enqueueDueReminders(getDb(), madrid('2026-11-17', '08:00'))).toHaveLength(1);
    // Lunes 09:00 (antes, en otra simulación): el cliente la cambia al miércoles; vuelve a NULL.
    await rescheduleOwn(c.id, a.id, { fecha: '2026-11-18', profesional: 'nerea-olmedo', hora: '12:00' }, { now: NOW });
    expect((await q('SELECT reminder_sent_at FROM appointments'))[0]).toEqual({ reminder_sent_at: null });
    expect(await enqueueDueReminders(getDb(), madrid('2026-11-18', '08:00'))).toHaveLength(1);
    const mails = await reminders();
    expect(mails).toHaveLength(2);
    expect(mails[1]!.payload.text).toContain('miércoles, 18 de noviembre de 2026');
    expect(mails[1]!.payload.text).toContain('/mi-cuenta/citas');
  });

  it('con reminder_hours_before = 0 no hace nada', async () => {
    await truncateAll();
    await seedBookingConfig((c) => (c.booking.rules = { reminder_hours_before: 0 }));
    await createAppointment({ startsAt: hoursAfter(2) });
    expect(await enqueueDueReminders(getDb(), NOW)).toEqual([]);
    expect(await reminders()).toHaveLength(0);
  });
});
