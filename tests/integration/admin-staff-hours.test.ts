import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadBookingConfig } from '@/db/queries/booking-config';
import { getClinicPageData } from '@/db/queries/clinic';
import { weekForm } from '@/domain/admin-schemas';
import { saveStaffHours } from '@/lib/admin/hours';
import { listStaffWithStats, saveStaff } from '@/lib/admin/staff';
import { bookAppointment } from '@/lib/booking/book';
import { slotsForDay } from '@/lib/booking/slots';
import { createAppointment, createCustomer, formData, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll, type BookingSeed } from './helpers/db';
import { ctxFor, guestForm, NOW, TUESDAY } from './helpers/booking';

// Veterinarios y su horario desde el panel (US3, FR-015 a FR-019).

const week = (values: Record<string, string>) => weekForm((name) => values[name] ?? null);

async function freeTimes(staffSlug: string | null, serviceSlug = 'consulta-general', date = TUESDAY): Promise<string[]> {
  const config = (await loadBookingConfig())!;
  const service = config.services.find((s) => s.slug === serviceSlug);
  if (!service) return [];
  const staffId = staffSlug ? (config.staff.find((m) => m.slug === staffSlug)?.id ?? 'ninguno') : null;
  return (await slotsForDay(config, { date, service, staffId, now: NOW })).map((s) => s.time);
}

describe('veterinarios y horarios desde el panel', () => {
  let seed: BookingSeed;
  let admin: { id: string };

  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    seed = await seedBookingConfig();
    admin = { id: (await createCustomer({ admin: true })).id };
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('alta de veterinario: sin publicar, fuera de la página del equipo y sin horario no recibe reservas', async () => {
    const r = await saveStaff(
      admin,
      { name: 'Dra. Carla Ruiz', bookable: true, booking_position: 3, service_ids: [seed.services.consulta] },
      { now: NOW, submissionId: randomUUID() },
    );
    expect(r).toMatchObject({ status: 'ok', created: true });
    expect(await q("SELECT slug, published, bookable, photo_path FROM team_members WHERE name = 'Dra. Carla Ruiz'")).toEqual([
      { slug: 'dra-carla-ruiz', published: false, bookable: true, photo_path: null },
    ]);
    expect((await getClinicPageData()).team.map((m) => m.name)).not.toContain('Dra. Carla Ruiz');
    // Sin tramos: no se ofrece (FR-017) y la lista lo avisa.
    expect(await freeTimes('dra-carla-ruiz')).toEqual([]);
    const listed = (await listStaffWithStats(NOW)).find((m) => m.slug === 'dra-carla-ruiz')!;
    expect(listed).toMatchObject({ hourRanges: 0, serviceNames: ['Consulta general'] });
    // Con horario, sí.
    if (r.status !== 'ok') return;
    const h = await saveStaffHours(admin, r.id, week({ d2_0_opens: '10:00', d2_0_closes: '12:00' }), { now: NOW });
    expect(h).toEqual({ status: 'ok', affected: 0, outsideClinic: false });
    expect(await freeTimes('dra-carla-ruiz')).toEqual(['10:00', '10:30', '11:00', '11:30']);
    expect((await q("SELECT action FROM admin_audit_log ORDER BY at")).map((a) => a.action)).toEqual(['staff.create', 'staff.hours']);
  });

  it('bookable desactivado: no se ofrece ni se asigna con "Sin preferencia" y sus citas se mantienen', async () => {
    const a = await createAppointment({ staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '12:00') });
    await saveStaff(admin, { id: seed.staff.nerea, name: 'Dra. Nerea Olmedo', bookable: false, booking_position: 0, service_ids: [seed.services.consulta] }, { now: NOW });
    expect(await freeTimes('nerea-olmedo')).toEqual([]);
    await bookAppointment(guestForm({ correo: 'x@example.test' }), ctxFor());
    const rows = await q("SELECT team_member_id FROM appointments WHERE status = 'confirmed' AND id <> $1", [a.id]);
    expect(rows).toEqual([{ team_member_id: seed.staff.inigo }]);
    expect(await q('SELECT status FROM appointments WHERE id = $1', [a.id])).toEqual([{ status: 'confirmed' }]);
  });

  it('horario con errores por campo y sin guardado parcial', async () => {
    const before = await q('SELECT count(*)::int AS n FROM staff_hours WHERE team_member_id = $1', [seed.staff.nerea]);
    const r = await saveStaffHours(
      admin,
      seed.staff.nerea,
      week({ d1_0_opens: '09:00', d1_0_closes: '14:00', d2_0_opens: '12:00', d2_0_closes: '11:00', d3_0_opens: '09:00', d3_0_closes: '12:00', d3_1_opens: '11:00', d3_1_closes: '13:00' }),
      { now: NOW },
    );
    expect(r.status).toBe('invalid');
    if (r.status !== 'invalid') return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual(['d2_0_closes', 'd3_1_opens']);
    expect(await q('SELECT count(*)::int AS n FROM staff_hours WHERE team_member_id = $1', [seed.staff.nerea])).toEqual(before);
  });

  it('un tramo fuera del horario de la clínica se guarda, avisa y esa parte no se ofrece', async () => {
    const r = await saveStaffHours(admin, seed.staff.nerea, week({ d2_0_opens: '13:00', d2_0_closes: '17:00' }), { now: NOW });
    expect(r).toMatchObject({ status: 'ok', outsideClinic: true });
    expect(await freeTimes('nerea-olmedo')).toEqual(['13:00', '13:30', '16:30']);
  });

  it('citas que quedan fuera del horario nuevo: se cuentan y se mantienen', async () => {
    await createAppointment({ staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '17:00') });
    await createAppointment({ staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00') });
    await createAppointment({ staff: 'nerea-olmedo', startsAt: madrid('2026-11-02', '17:00') }); // pasada: no cuenta
    const r = await saveStaffHours(admin, seed.staff.nerea, week({ d2_0_opens: '09:30', d2_0_closes: '14:00' }), { now: NOW });
    expect(r).toEqual({ status: 'ok', affected: 1, outsideClinic: false });
    expect(await q("SELECT count(*)::int AS n FROM appointments WHERE status = 'confirmed'")).toEqual([{ n: 3 }]);
  });

  it('veterinario sin tramos: semana vacía', async () => {
    const r = await saveStaffHours(admin, seed.staff.inigo, week({}), { now: NOW });
    expect(r).toMatchObject({ status: 'ok' });
    expect(await freeTimes('inigo-barral')).toEqual([]);
    expect(await freeTimes(null, 'cirugia')).toEqual([]); // la cirugía solo la atendía él
    expect(formData({}).get('x')).toBeNull();
  });
});
