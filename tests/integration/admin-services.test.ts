import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadBookingConfig } from '@/db/queries/booking-config';
import { serviceForm, type ServiceFormData } from '@/domain/admin-schemas';
import { listServicesWithStats, saveService } from '@/lib/admin/services';
import { slotsForDay } from '@/lib/booking/slots';
import { createAppointment, createCustomer, createStaffHours, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll, type BookingSeed } from './helpers/db';
import { NOW, TUESDAY } from './helpers/booking';

// Servicios desde el panel (US3, FR-012 a FR-014, FR-018).

async function freeTimes(serviceSlug: string, date = TUESDAY, staffSlug: string | null = null): Promise<string[]> {
  const config = (await loadBookingConfig())!;
  const service = config.services.find((s) => s.slug === serviceSlug);
  if (!service) return [];
  const staffId = staffSlug ? (config.staff.find((m) => m.slug === staffSlug)?.id ?? null) : null;
  return (await slotsForDay(config, { date, service, staffId, now: NOW })).map((s) => s.time);
}

const input = (over: Partial<ServiceFormData>): ServiceFormData => ({
  name: 'Ecografía',
  duration_minutes: 45,
  active: true,
  position: 5,
  staff_ids: [],
  ...over,
});

describe('servicios desde el panel', () => {
  let seed: BookingSeed;
  let admin: { id: string };

  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    seed = await seedBookingConfig((c) => (c.booking.rules = { slot_step_minutes: 15 }));
    admin = { id: (await createCustomer({ admin: true })).id };
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('crear un servicio de 45 min con un veterinario de martes 10:00–13:00: solo esas franjas, en el acto', async () => {
    await createStaffHours('inigo-barral', [{ weekday: 2, opens: '10:00', closes: '13:00' }]);
    const r = await saveService(admin, input({ staff_ids: [seed.staff.inigo] }), { now: NOW, submissionId: randomUUID() });
    expect(r).toMatchObject({ status: 'ok', created: true, noSlots: false });
    const [row] = await q("SELECT slug, published FROM booking_services WHERE name = 'Ecografía'");
    expect(row).toEqual({ slug: 'ecografia', published: true });
    const t = await freeTimes('ecografia');
    expect(t[0]).toBe('10:00');
    expect(t.at(-1)).toBe('12:15');
    // Desactivarlo: deja de ofrecerse en la siguiente consulta.
    if (r.status !== 'ok') return;
    expect((await saveService(admin, input({ id: r.id, active: false, staff_ids: [seed.staff.inigo] }), { now: NOW })).status).toBe('ok');
    expect(await freeTimes('ecografia')).toEqual([]);
    const audit = await q('SELECT action FROM admin_audit_log ORDER BY at');
    expect(audit.map((a) => a.action)).toEqual(['service.create', 'service.update']);
  });

  it('el alta es idempotente con el mismo submission_id', async () => {
    const submissionId = randomUUID();
    await saveService(admin, input({}), { now: NOW, submissionId });
    const again = await saveService(admin, input({}), { now: NOW, submissionId });
    expect(again).toMatchObject({ status: 'ok', created: false });
    expect(await q("SELECT count(*)::int AS n FROM booking_services WHERE name = 'Ecografía'")).toEqual([{ n: 1 }]);
  });

  it('nombre duplicado sin distinguir mayúsculas y duración no válida', async () => {
    expect(await saveService(admin, input({ name: 'CONSULTA GENERAL' }), { now: NOW })).toEqual({
      status: 'invalid',
      fieldErrors: { name: 'Ya hay un servicio con ese nombre.' },
    });
    const bad = serviceForm.safeParse({ name: 'X', duration_minutes: '47', position: '0', staff_ids: [] });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['name', 'duration_minutes']));
    expect(serviceForm.safeParse({ name: 'Ok', duration_minutes: '485', position: '0', staff_ids: [] }).success).toBe(false);
  });

  it('cambiar la duración o desactivar con citas futuras: se mantienen con su ends_at y se informa del número', async () => {
    const a = await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00') });
    await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid('2026-11-02', '10:00') }); // pasada
    const r = await saveService(
      admin,
      input({ id: seed.services.consulta, name: 'Consulta general', duration_minutes: 45, staff_ids: [seed.staff.nerea, seed.staff.inigo] }),
      { now: NOW },
    );
    expect(r).toMatchObject({ status: 'ok', futureCount: 1 });
    const [row] = await q('SELECT ends_at FROM appointments WHERE id = $1', [a.id]);
    expect(row!.ends_at.toISOString()).toBe(madrid(TUESDAY, '10:30').toISOString());
    // Las reservas nuevas usan la duración nueva.
    const config = (await loadBookingConfig())!;
    expect(config.services.find((s) => s.slug === 'consulta-general')!.durationMinutes).toBe(45);
    const list = await listServicesWithStats(NOW);
    expect(list.find((s) => s.id === seed.services.consulta)).toMatchObject({ futureCount: 1, staffNames: expect.arrayContaining(['Dra. Nerea Olmedo']) });
    // Desactivar también informa; editar sin tocar duración ni estado, no.
    expect(await saveService(admin, input({ id: seed.services.consulta, name: 'Consulta general', duration_minutes: 45, active: false }), { now: NOW })).toMatchObject({ futureCount: 1 });
  });

  it('asignación de veterinarios: quitar uno deja de ofrecerlo para ese servicio', async () => {
    expect(await freeTimes('cirugia', TUESDAY, 'inigo-barral')).toContain('10:00');
    await saveService(admin, input({ id: seed.services.cirugia, name: 'Cirugía', duration_minutes: 60, staff_ids: [seed.staff.nerea] }), { now: NOW });
    expect(await freeTimes('cirugia', TUESDAY, 'inigo-barral')).toEqual([]);
    expect(await freeTimes('cirugia', TUESDAY, 'nerea-olmedo')).toContain('10:00');
  });

  it('aviso sin-franjas si ningún tramo admite la duración', async () => {
    await createStaffHours('inigo-barral', [{ weekday: 2, opens: '10:00', closes: '11:00' }]);
    const r = await saveService(admin, input({ name: 'Cirugía larga', duration_minutes: 120, staff_ids: [seed.staff.inigo] }), { now: NOW });
    expect(r).toMatchObject({ status: 'ok', noSlots: true });
  });
});
