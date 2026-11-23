import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadBookingConfig } from '@/db/queries/booking-config';
import { dispatchPending } from '@/email/dispatch';
import { createFakeProvider } from '@/email/fake';
import { startFakeEmailServer, type FakeEmailServer } from '../../scripts/fake-email-provider';
import { adminCancel, adminMove } from '@/lib/admin/appointments';
import { bookAppointment } from '@/lib/booking/book';
import { readManagedAppointment } from '@/lib/booking/clinic-manage';
import { signManageToken } from '@/lib/booking/manage-link';
import { slotsForDay } from '@/lib/booking/slots';
import { createAppointment, createBlock, createCustomer, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll, type BookingSeed } from './helpers/db';
import { ctxFor, guestForm, NOW, TUESDAY } from './helpers/booking';

// Cancelar y mover desde el panel (US4, FR-020 a FR-024, F11).

let fake: FakeEmailServer;
// Intento de envío inmediato (SC-004) con el proveedor falso, sin email:dispatch.
const onEmails = async (ids: string[]) => {
  await dispatchPending({ provider: createFakeProvider(fake.url, 'PetCare <no-responder@example.test>'), outboxIds: ids });
};

async function freeTimes(date: string, staffSlug: string): Promise<string[]> {
  const config = (await loadBookingConfig())!;
  const service = config.services.find((s) => s.slug === 'consulta-general')!;
  const staffId = config.staff.find((m) => m.slug === staffSlug)!.id;
  return (await slotsForDay(config, { date, service, staffId, now: NOW })).map((s) => s.time);
}

describe('cancelar y mover desde el panel', () => {
  let seed: BookingSeed;
  let admin: { id: string };

  beforeAll(async () => {
    await setupTestDb();
    fake = await startFakeEmailServer();
  });
  beforeEach(async () => {
    await truncateAll();
    fake.emails.length = 0;
    seed = await seedBookingConfig();
    admin = { id: (await createCustomer({ admin: true, firstName: 'Recepción' })).id };
  });
  afterAll(async () => {
    await fake.close();
    await teardownTestDb();
  });

  const appt = (time: string, date = TUESDAY, staff = 'nerea-olmedo', extra: Record<string, unknown> = {}) =>
    createAppointment({ service: 'consulta-general', staff, startsAt: madrid(date, time), contactEmail: 'ana@example.test', ...extra });

  it('cancelar con nota: cancelled_by clinic, evento admin con nota, correo con la nota y envío en el acto', async () => {
    const a = await appt('10:00');
    expect(await freeTimes(TUESDAY, 'nerea-olmedo')).not.toContain('10:00');
    const r = await adminCancel(admin, { id: a.id, version: 1, note: 'Lo sentimos: la doctora está de baja.' }, { now: NOW, onEmails });
    expect(r.status).toBe('ok');
    expect(await q('SELECT status, cancelled_by, manage_version FROM appointments WHERE id = $1', [a.id])).toEqual([
      { status: 'cancelled', cancelled_by: 'clinic', manage_version: 2 },
    ]);
    expect(await q('SELECT kind, actor, admin_id, note FROM appointment_events WHERE appointment_id = $1', [a.id])).toEqual([
      { kind: 'cancelled', actor: 'admin', admin_id: admin.id, note: 'Lo sentimos: la doctora está de baja.' },
    ]);
    const [mail] = await q("SELECT status FROM email_outbox WHERE kind = 'appointment_cancelled' AND appointment_id = $1", [a.id]);
    expect(mail!.status).toBe('sent');
    const sent = fake.emails.find((e) => /se ha cancelado$/.test(String(e.body.subject ?? '')))!;
    expect(sent.body.textContent).toContain('La clínica ha cancelado tu cita');
    expect(sent.body.textContent).toContain('Mensaje de la clínica');
    expect(sent.body.textContent).toContain('la doctora está de baja');
    expect(await freeTimes(TUESDAY, 'nerea-olmedo')).toContain('10:00');
  });

  it('reenvío idempotente (un solo correo) y versión obsoleta', async () => {
    const a = await appt('10:00');
    await adminCancel(admin, { id: a.id, version: 1, note: '' }, { now: NOW });
    expect(await adminCancel(admin, { id: a.id, version: 1, note: '' }, { now: NOW })).toEqual({ status: 'ok', emailIds: [] });
    expect(await q("SELECT count(*)::int AS n FROM email_outbox WHERE kind = 'appointment_cancelled'")).toEqual([{ n: 1 }]);
    // Versión obsoleta: otra cita que se movió entre tanto.
    const b = await appt('11:00');
    await q('UPDATE appointments SET manage_version = 3 WHERE id = $1', [b.id]);
    expect(await adminCancel(admin, { id: b.id, version: 1, note: '' }, { now: NOW })).toEqual({ status: 'stale' });
    expect(await adminMove(admin, { id: b.id, version: 1, date: TUESDAY, time: '12:00', staff_id: seed.staff.nerea }, { now: NOW })).toEqual({ status: 'stale' });
  });

  it('cita pasada o cancelada: no-modificable', async () => {
    const past = await appt('10:00', '2026-11-02');
    expect(await adminCancel(admin, { id: past.id, version: 1, note: '' }, { now: NOW })).toEqual({ status: 'not_editable' });
    const cancelled = await appt('10:00', TUESDAY, 'nerea-olmedo', { status: 'cancelled', cancelledBy: 'customer' });
    expect(await adminCancel(admin, { id: cancelled.id, version: 1, note: '' }, { now: NOW })).toEqual({ status: 'not_editable' });
    expect(await adminMove(admin, { id: cancelled.id, version: 1, date: TUESDAY, time: '12:00', staff_id: seed.staff.nerea }, { now: NOW })).toEqual({
      status: 'not_editable',
    });
  });

  it('mover: sin antelación mínima ni horizonte, con horario, bloqueos y sin solapes; correo con la hora anterior y la nueva', async () => {
    const a = await appt('16:30', TUESDAY, 'nerea-olmedo', { reminderSentAt: new Date('2026-11-16T07:00:00Z') });
    // Hoy a las 09:30 (antes de la antelación de 120 min de la reserva pública) sí vale para el panel.
    const r = await adminMove(admin, { id: a.id, version: 1, date: '2026-11-16', time: '09:30', staff_id: seed.staff.inigo }, { now: NOW, onEmails });
    expect(r.status).toBe('ok');
    const [row] = await q('SELECT team_member_id, starts_at, manage_version, reminder_sent_at FROM appointments WHERE id = $1', [a.id]);
    expect(row).toMatchObject({ team_member_id: seed.staff.inigo, manage_version: 2, reminder_sent_at: null });
    expect(row!.starts_at.toISOString()).toBe(madrid('2026-11-16', '09:30').toISOString());
    const [e] = await q("SELECT * FROM appointment_events WHERE appointment_id = $1 AND kind = 'rescheduled'", [a.id]);
    expect(e).toMatchObject({ actor: 'admin', admin_id: admin.id, from_staff_id: seed.staff.nerea, to_staff_id: seed.staff.inigo });
    const [mail] = await q("SELECT status FROM email_outbox WHERE kind = 'appointment_changed'");
    expect(mail!.status).toBe('sent');
    const sent = fake.emails.find((e) => /ha cambiado$/.test(String(e.body.subject ?? '')))!;
    expect(sent.body.textContent).toContain('La clínica ha cambiado tu cita');
    expect(sent.body.textContent).toContain('16:30');
    expect(sent.body.textContent).toContain('Dra. Nerea Olmedo');
    // Más allá del horizonte de 60 días también vale (365 para el panel).
    const far = await adminMove(admin, { id: a.id, version: 2, date: '2027-03-02', time: '10:00', staff_id: seed.staff.inigo }, { now: NOW });
    expect(far.status).toBe('ok');
    // Horario y bloqueos sí cuentan.
    expect((await adminMove(admin, { id: a.id, version: 3, date: '2027-03-06', time: '10:00', staff_id: seed.staff.inigo }, { now: NOW })).status).toBe('slot_taken');
    await createBlock({ staff: 'inigo-barral', kind: 'once', startsAt: madrid('2027-03-03', '09:30'), endsAt: madrid('2027-03-03', '14:00') });
    expect((await adminMove(admin, { id: a.id, version: 3, date: '2027-03-03', time: '10:00', staff_id: seed.staff.inigo }, { now: NOW })).status).toBe('slot_taken');
    // Sin solapes.
    await appt('11:00', '2027-03-02', 'nerea-olmedo');
    expect((await adminMove(admin, { id: a.id, version: 3, date: '2027-03-02', time: '11:00', staff_id: seed.staff.nerea }, { now: NOW })).status).toBe('slot_taken');
  });

  it('un veterinario que no atiende el servicio se rechaza; un servicio inactivo se puede mover', async () => {
    const a = await createAppointment({ service: 'cirugia', staff: 'inigo-barral', startsAt: madrid(TUESDAY, '10:00') });
    const bad = await adminMove(admin, { id: a.id, version: 1, date: TUESDAY, time: '12:00', staff_id: seed.staff.nerea }, { now: NOW });
    expect(bad.status).toBe('invalid');
    await q("UPDATE booking_services SET published = false WHERE slug = 'cirugia'");
    expect((await adminMove(admin, { id: a.id, version: 1, date: TUESDAY, time: '12:00', staff_id: seed.staff.inigo }, { now: NOW })).status).toBe('ok');
  });

  it('reenvío de un movimiento ya hecho: ok sin otro correo', async () => {
    const a = await appt('10:00');
    const move = { id: a.id, version: 1, date: TUESDAY, time: '12:00', staff_id: seed.staff.nerea };
    expect((await adminMove(admin, move, { now: NOW })).status).toBe('ok');
    expect(await adminMove(admin, move, { now: NOW })).toEqual({ status: 'ok', emailIds: [] });
    expect(await q("SELECT count(*)::int AS n FROM email_outbox WHERE kind = 'appointment_changed'")).toEqual([{ n: 1 }]);
  });

  it('el enlace de gestión antiguo queda invalidado', async () => {
    const a = await appt('10:00');
    const token = signManageToken({ appointmentId: a.id, version: 1 });
    await adminMove(admin, { id: a.id, version: 1, date: TUESDAY, time: '12:00', staff_id: seed.staff.nerea }, { now: NOW });
    expect((await readManagedAppointment(token, NOW)).status).not.toBe('ok');
  });

  it('carrera: el admin mueve y un cliente reserva la misma franja; solo uno lo consigue', async () => {
    // Solo Nerea atiende ese día a esa hora: Íñigo está bloqueado.
    await createBlock({ staff: 'inigo-barral', kind: 'once', startsAt: madrid(TUESDAY, '09:30'), endsAt: madrid(TUESDAY, '14:00') });
    const a = await appt('16:30');
    const [moved, booked] = await Promise.all([
      adminMove(admin, { id: a.id, version: 1, date: TUESDAY, time: '12:00', staff_id: seed.staff.nerea }, { now: NOW }),
      bookAppointment(guestForm({ hora: '12:00', profesional: 'nerea-olmedo', correo: 'otro@example.test' }), ctxFor()),
    ]);
    const statuses = [moved.status, booked.status].sort();
    expect(statuses).toEqual(['ok', 'slot_taken']);
    expect(await q("SELECT count(*)::int AS n FROM appointments WHERE status = 'confirmed' AND starts_at = $1", [madrid(TUESDAY, '12:00')])).toEqual([{ n: 1 }]);
  });
});
