import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { availableSlots } from '@/domain/availability';
import { getDb } from '@/db/client';
import { busyIntervalsForDay } from '@/db/queries/appointments';
import { loadBookingConfig } from '@/db/queries/booking-config';
import { cancelOwn } from '@/lib/booking/cancel';
import { rescheduleOwn } from '@/lib/booking/reschedule';
import { createAppointment, createCustomer, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { NOW, TUESDAY } from './helpers/booking';

// Cancelar y cambiar desde la cuenta (US4, B13, FR-023 a FR-025).

async function freeTimes(date: string, staff: string | null = null): Promise<string[]> {
  const config = (await loadBookingConfig())!;
  const service = config.services.find((s) => s.slug === 'consulta-general')!;
  const staffId = staff ? config.staff.find((m) => m.slug === staff)!.id : null;
  const busy = await busyIntervalsForDay(getDb(), date);
  return availableSlots({ ...config, date, service, staffId, busy, now: NOW }).map((s) => s.time);
}

describe('cancelar y cambiar una cita propia', () => {
  let customerId: string;

  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedBookingConfig();
    customerId = (await createCustomer()).id;
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  const own = (time: string, date = TUESDAY, staff = 'nerea-olmedo') =>
    createAppointment({ customerId, service: 'consulta-general', staff, startsAt: madrid(date, time), contactEmail: 'cliente@example.test' });

  it('cancelar dentro de plazo libera la hora, sube la versión y encola 2 correos', async () => {
    const a = await own('10:00');
    expect(await freeTimes(TUESDAY, 'nerea-olmedo')).not.toContain('10:00');
    const r = await cancelOwn(customerId, a.id, { now: NOW });
    expect(r).toMatchObject({ status: 'ok' });
    expect((await q('SELECT status, cancelled_by, manage_version FROM appointments WHERE id = $1', [a.id]))[0]).toEqual({
      status: 'cancelled',
      cancelled_by: 'customer',
      manage_version: 2,
    });
    expect(await freeTimes(TUESDAY, 'nerea-olmedo')).toContain('10:00');
    expect((await q('SELECT kind FROM email_outbox ORDER BY kind')).map((r) => r.kind)).toEqual(['appointment_cancelled', 'clinic_appointment']);
  });

  it('fuera de plazo da out_of_window y no cambia nada', async () => {
    // Lunes 09:00: una cita ese mismo lunes a las 16:30 está a menos de 24 h.
    const a = await own('16:30', '2026-11-16');
    expect(await cancelOwn(customerId, a.id, { now: NOW })).toEqual({ status: 'out_of_window' });
    expect(await rescheduleOwn(customerId, a.id, { fecha: TUESDAY, profesional: 'sin-preferencia', hora: '12:00' }, { now: NOW })).toEqual({
      status: 'out_of_window',
    });
    expect((await q('SELECT status FROM appointments'))[0]).toEqual({ status: 'confirmed' });
  });

  it('cancelar dos veces da already_cancelled; una cita pasada, también', async () => {
    const a = await own('12:00');
    await cancelOwn(customerId, a.id, { now: NOW });
    expect(await cancelOwn(customerId, a.id, { now: NOW })).toEqual({ status: 'already_cancelled' });
    const past = await createAppointment({ customerId, startsAt: madrid('2026-11-13', '10:00') });
    expect(await cancelOwn(customerId, past.id, { now: NOW })).toEqual({ status: 'already_cancelled' });
  });

  it('un cambio a una hora libre es atómico: la antigua queda libre y la nueva ocupada', async () => {
    const a = await own('12:00');
    const r = await rescheduleOwn(customerId, a.id, { fecha: TUESDAY, profesional: 'nerea-olmedo', hora: '16:30' }, { now: NOW });
    expect(r).toMatchObject({ status: 'ok', changed: true, manageVersion: 2 });
    const [row] = await q('SELECT id, starts_at, manage_version, reminder_sent_at FROM appointments');
    expect(row!.id).toBe(a.id);
    expect(row!.starts_at.toISOString()).toBe(madrid(TUESDAY, '16:30').toISOString());
    const free = await freeTimes(TUESDAY, 'nerea-olmedo');
    expect(free).toContain('12:00');
    expect(free).not.toContain('16:30');
    const kinds = (await q('SELECT kind, payload FROM email_outbox ORDER BY kind')).map((m) => m.kind);
    expect(kinds).toEqual(['appointment_changed', 'clinic_appointment']);
  });

  it('un cambio a una hora ocupada da slot_taken y la cita conserva la original', async () => {
    const a = await own('12:00');
    await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '16:30') });
    const r = await rescheduleOwn(customerId, a.id, { fecha: TUESDAY, profesional: 'nerea-olmedo', hora: '16:30' }, { now: NOW });
    expect(r).toEqual({ status: 'slot_taken' });
    expect((await q('SELECT starts_at FROM appointments WHERE id = $1', [a.id]))[0]!.starts_at.toISOString()).toBe(madrid(TUESDAY, '12:00').toISOString());
  });

  it('dos cambios simultáneos a la misma hora: solo uno lo consigue', async () => {
    const a = await own('12:00');
    const b = await own('12:30');
    const input = { fecha: TUESDAY, profesional: 'nerea-olmedo', hora: '17:00' };
    const results = await Promise.all([rescheduleOwn(customerId, a.id, input, { now: NOW }), rescheduleOwn(customerId, b.id, input, { now: NOW })]);
    expect(results.map((r) => r.status).sort()).toEqual(['ok', 'slot_taken']);
  });

  it('un cambio a otro día funciona y toma los dos bloqueos', async () => {
    const a = await own('12:00');
    const r = await rescheduleOwn(customerId, a.id, { fecha: '2026-11-19', profesional: 'sin-preferencia', hora: '10:00' }, { now: NOW });
    expect(r).toMatchObject({ status: 'ok', changed: true });
    expect((await q('SELECT starts_at FROM appointments'))[0]!.starts_at.toISOString()).toBe(madrid('2026-11-19', '10:00').toISOString());
  });

  it('cambiar a la misma hora no hace nada ni envía correo', async () => {
    const a = await own('12:00');
    const r = await rescheduleOwn(customerId, a.id, { fecha: TUESDAY, profesional: 'nerea-olmedo', hora: '12:00' }, { now: NOW });
    expect(r).toMatchObject({ status: 'ok', changed: false });
    expect(await q('SELECT count(*)::int AS n FROM email_outbox')).toEqual([{ n: 0 }]);
    expect((await q('SELECT manage_version FROM appointments'))[0]).toEqual({ manage_version: 1 });
  });

  it('un cambio vuelve a programar el recordatorio (reminder_sent_at a NULL)', async () => {
    const a = await createAppointment({ customerId, staff: 'nerea-olmedo', service: 'consulta-general', startsAt: madrid(TUESDAY, '12:00'), reminderSentAt: NOW });
    await rescheduleOwn(customerId, a.id, { fecha: TUESDAY, profesional: 'nerea-olmedo', hora: '13:00' }, { now: NOW });
    expect((await q('SELECT reminder_sent_at FROM appointments'))[0]).toEqual({ reminder_sent_at: null });
  });

  it('una hora mal escrita o fuera de la cuadrícula da invalid', async () => {
    const a = await own('12:00');
    expect(await rescheduleOwn(customerId, a.id, { fecha: TUESDAY, profesional: 'nerea-olmedo', hora: '12:10' }, { now: NOW })).toMatchObject({
      status: 'invalid',
      fieldErrors: { hora: expect.any(String) },
    });
  });
});
