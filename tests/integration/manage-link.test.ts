import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clinicCancel, clinicReschedule, readManagedAppointment } from '@/lib/booking/clinic-manage';
import { signManageToken } from '@/lib/booking/manage-link';
import { logger } from '@/lib/logger';
import { createAppointment, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { NOW, TUESDAY } from './helpers/booking';

// Enlace de gestión de la clínica (US5, B7, FR-027).

describe('enlace de gestión de la clínica', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    await seedBookingConfig();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  // Cita de invitado el mismo lunes a las 16:30 (a menos de 24 h): la clínica no tiene plazo.
  const guestAppt = () =>
    createAppointment({ staff: 'nerea-olmedo', startsAt: madrid('2026-11-16', '16:30'), contactEmail: 'invitado@example.test', reason: 'Privado' });

  it('un token válido muestra la cita y permite cancelar sin plazo, con correo al invitado', async () => {
    const a = await guestAppt();
    const token = signManageToken({ appointmentId: a.id, version: 1 });
    expect(await readManagedAppointment(token, NOW)).toMatchObject({ status: 'ok', serviceName: 'Consulta general' });
    const r = await clinicCancel(token, { now: NOW });
    expect(r).toMatchObject({ status: 'ok' });
    expect((await q('SELECT status, cancelled_by, manage_version FROM appointments'))[0]).toEqual({
      status: 'cancelled',
      cancelled_by: 'clinic',
      manage_version: 2,
    });
    const [mail] = await q("SELECT payload FROM email_outbox WHERE kind = 'appointment_cancelled'");
    expect(mail!.payload.to.email).toBe('invitado@example.test');
    expect(mail!.payload.text).toContain('La clínica ha cancelado esta cita');
    // El mismo enlace ya no sirve.
    expect(await readManagedAppointment(token, NOW)).toEqual({ status: 'invalid' });
    expect(await clinicCancel(token, { now: NOW })).toEqual({ status: 'invalid' });
  });

  it('un cambio genera un correo a la clínica con un token nuevo y el antiguo deja de valer', async () => {
    const a = await guestAppt();
    const old = signManageToken({ appointmentId: a.id, version: 1 });
    const r = await clinicReschedule(old, { fecha: TUESDAY, profesional: 'sin-preferencia', hora: '12:00' }, { now: NOW });
    expect(r).toMatchObject({ status: 'ok' });
    if (r.status !== 'ok') return;
    expect(r.token).toBe(signManageToken({ appointmentId: a.id, version: 2 }));
    const [clinicMail] = await q("SELECT payload FROM email_outbox WHERE kind = 'clinic_appointment'");
    expect(clinicMail!.payload.text).toContain(`/gestion-cita/${r.token}`);
    expect(clinicMail!.payload.text).not.toContain(old);
    expect(await readManagedAppointment(old, NOW)).toEqual({ status: 'invalid' });
    expect(await readManagedAppointment(r.token, NOW)).toMatchObject({ status: 'ok' });
    // Un cambio a una hora ocupada con el enlace nuevo no cambia nada.
    await createAppointment({ staff: 'nerea-olmedo', service: 'consulta-general', startsAt: madrid(TUESDAY, '13:00') });
    await createAppointment({ staff: 'inigo-barral', service: 'consulta-general', startsAt: madrid(TUESDAY, '13:00') });
    expect(await clinicReschedule(r.token, { fecha: TUESDAY, profesional: 'sin-preferencia', hora: '13:00' }, { now: NOW })).toEqual({ status: 'slot_taken' });
  });

  it('un token manipulado, de una cita pasada o de una cita cancelada no muestra datos', async () => {
    const a = await guestAppt();
    const token = signManageToken({ appointmentId: a.id, version: 1 });
    expect(await readManagedAppointment(`${token}x`, NOW)).toEqual({ status: 'invalid' });
    expect(await readManagedAppointment('nada', NOW)).toEqual({ status: 'invalid' });
    expect(await readManagedAppointment(token, new Date('2026-11-16T16:00:00Z'))).toEqual({ status: 'invalid' });
    const cancelled = await createAppointment({ startsAt: madrid(TUESDAY, '10:00'), status: 'cancelled' });
    expect(await readManagedAppointment(signManageToken({ appointmentId: cancelled.id, version: 1 }), NOW)).toEqual({ status: 'invalid' });
  });

  it('cada uso queda en el log solo con el id de la cita y el resultado', async () => {
    const info = vi.spyOn(logger, 'info');
    const a = await guestAppt();
    const token = signManageToken({ appointmentId: a.id, version: 1 });
    await readManagedAppointment(token, NOW);
    await clinicCancel(token, { now: NOW });
    await readManagedAppointment('nada', NOW);
    const calls = info.mock.calls.filter((c) => String(c[1]).startsWith('manage_link_'));
    expect(calls.map((c) => [c[1], c[0]])).toEqual([
      ['manage_link_view', { appointment_id: a.id, code: 'ok' }],
      ['manage_link_cancel', { appointment_id: a.id, code: 'ok' }],
      ['manage_link_view', { appointment_id: null, code: 'bad_token' }],
    ]);
    expect(JSON.stringify(calls)).not.toContain('invitado@example.test');
    expect(JSON.stringify(calls)).not.toContain(token);
  });
});
