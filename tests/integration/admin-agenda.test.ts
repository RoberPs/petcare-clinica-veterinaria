import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import { agendaForRange, agendaStaff, appointmentDetail } from '@/db/queries/admin-agenda';
import { loadBookingConfig, loadStaffHours } from '@/db/queries/booking-config';
import { blocksForRange } from '@/db/queries/schedule-blocks';
import { agendaRange, buildAgenda, parseAgendaParams, weekStart } from '@/domain/agenda-view';
import { dayBounds } from '@/domain/availability';
import { addDays } from '@/domain/time';
import { anonymizeCustomerAppointments } from '@/lib/booking/cancel';
import { createAppointment, createBlock, createCustomer, createStaffHours, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { NOW, TUESDAY } from './helpers/booking';

// Agenda del panel (US2, FR-007 a FR-011, F9, F16).

async function agenda(view: 'dia' | 'semana', date: string, includeCancelled = false) {
  const p = parseAgendaParams({ vista: view, fecha: date, ...(includeCancelled ? { canceladas: '1' } : {}) }, TUESDAY);
  const { from, days } = agendaRange(p);
  const { start } = dayBounds(from);
  const { end } = dayBounds(from, days);
  const appts = await agendaForRange(start, end, { includeCancelled: p.includeCancelled });
  const config = (await loadBookingConfig())!;
  const until = addDays(from, days);
  return buildAgenda({
    appointments: appts,
    staff: await agendaStaff(appts.map((a) => a.teamMemberId)),
    clinicHours: config.weeklyHours,
    staffHours: await loadStaffHours(),
    closures: config.closures,
    blocks: await blocksForRange(from, until),
    from,
    days,
    now: NOW,
  });
}

describe('agenda del panel', () => {
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

  it('día: citas por veterinario ordenadas y las canceladas solo con el filtro', async () => {
    await createAppointment({ staff: 'nerea-olmedo', service: 'consulta-general', startsAt: madrid(TUESDAY, '12:00'), petName: 'Lúa', contactName: 'Ana Pérez' });
    await createAppointment({ staff: 'nerea-olmedo', service: 'consulta-general', startsAt: madrid(TUESDAY, '10:00'), petName: 'Bruno' });
    await createAppointment({ staff: 'inigo-barral', service: 'cirugia', startsAt: madrid(TUESDAY, '11:00') });
    await createAppointment({ staff: 'inigo-barral', service: 'consulta-general', startsAt: madrid(TUESDAY, '16:30'), status: 'cancelled' });

    const cols = await agenda('dia', TUESDAY);
    expect(cols.map((c) => c.staff.slug)).toEqual(['nerea-olmedo', 'inigo-barral']);
    const nerea = cols[0]!.days[0]!;
    expect(nerea.items.map((i) => `${i.start}-${i.end} ${i.petName}`)).toEqual(['10:00-10:30 Bruno', '12:00-12:30 Lúa']);
    expect(nerea.items[1]).toMatchObject({ ownerName: 'Ana Pérez', serviceName: 'Consulta general', state: 'confirmada', outsideSchedule: false });
    expect(cols[1]!.days[0]!.items).toHaveLength(1);

    const withCancelled = await agenda('dia', TUESDAY, true);
    expect(withCancelled[1]!.days[0]!.items.map((i) => i.state)).toEqual(['confirmada', 'cancelada']);
  });

  it('marcas "Fuera de horario" y "Servicio inactivo"', async () => {
    await createAppointment({ staff: 'nerea-olmedo', service: 'vacunacion', startsAt: madrid(TUESDAY, '10:00') });
    await createAppointment({ staff: 'nerea-olmedo', service: 'consulta-general', startsAt: madrid(TUESDAY, '12:00') });
    await q("UPDATE booking_services SET published = false WHERE slug = 'vacunacion'");
    await createBlock({ staff: 'nerea-olmedo', kind: 'once', startsAt: madrid(TUESDAY, '11:30'), endsAt: madrid(TUESDAY, '12:30'), reason: 'Formación' });
    const items = (await agenda('dia', TUESDAY))[0]!.days[0]!.items;
    expect(items[0]).toMatchObject({ serviceInactive: true, outsideSchedule: false });
    expect(items[1]).toMatchObject({ serviceInactive: false, outsideSchedule: true });
  });

  it('bloqueos con su motivo y tramos sin horario', async () => {
    await createStaffHours('inigo-barral', [{ weekday: 2, opens: '10:00', closes: '13:00' }]);
    await createBlock({ kind: 'once', startsAt: madrid(TUESDAY, '17:00'), endsAt: madrid(TUESDAY, '18:00'), reason: 'Reunión' });
    const [nerea, inigo] = await agenda('dia', TUESDAY);
    expect(nerea!.days[0]!.blocks).toEqual([expect.objectContaining({ start: '17:00', end: '18:00', reason: 'Reunión', clinicWide: true })]);
    expect(inigo!.days[0]!.hours).toEqual([{ start: '10:00', end: '13:00' }]);
    expect(inigo!.days[0]!.off).toEqual([
      { start: '09:30', end: '10:00' },
      { start: '13:00', end: '14:00' },
      { start: '16:30', end: '20:00' },
    ]);
    expect(nerea!.days[0]!.off).toEqual([]);
  });

  it('una cita anonimizada se muestra sin datos personales', async () => {
    const c = await createCustomer();
    const a = await createAppointment({ customerId: c.id, staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00'), contactName: 'Ana Pérez' });
    await getDb().transaction((tx) => anonymizeCustomerAppointments(tx, c.id, NOW));
    expect((await agenda('dia', TUESDAY))[0]!.days[0]!.items[0]!.ownerName).toBeNull();
    const detail = (await appointmentDetail(a.id))!;
    expect(detail).toMatchObject({ contactName: null, contactEmail: null, contactPhone: null, reason: null });
  });

  it('semana de lunes a domingo; también la del cambio de hora', async () => {
    expect(weekStart(TUESDAY)).toBe('2026-11-16');
    await createAppointment({ staff: 'nerea-olmedo', startsAt: madrid('2026-11-16', '10:00') });
    await createAppointment({ staff: 'nerea-olmedo', startsAt: madrid('2026-11-20', '10:00') });
    await createAppointment({ staff: 'nerea-olmedo', startsAt: madrid('2026-11-23', '10:00') }); // lunes siguiente
    const week = (await agenda('semana', '2026-11-19'))[0]!;
    expect(week.days.map((d) => d.date)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(week.days.flatMap((d) => d.items)).toHaveLength(2);
    // Semana del 26/10/2026 (el domingo 25 cambió la hora): el rango empieza el lunes a las 00:00.
    expect(dayBounds(weekStart('2026-10-28')).start.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    const autumn = (await agenda('semana', '2026-10-21'))[0]!;
    expect(autumn.days[6]!.date).toBe('2026-10-25');
  });

  it('el detalle trae contacto, versión e historial', async () => {
    const a = await createAppointment({ staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00'), contactEmail: 'ana@example.test', reason: 'Cojea' });
    await q("INSERT INTO appointment_events (appointment_id, kind, actor, at) VALUES ($1, 'created', 'guest_link', now() - interval '1 day')", [a.id]);
    const d = (await appointmentDetail(a.id))!;
    expect(d).toMatchObject({ contactEmail: 'ana@example.test', reason: 'Cojea', bookedAs: 'guest', manageVersion: 1, staffName: 'Dra. Nerea Olmedo' });
    expect(d.events.map((e) => e.kind)).toEqual(['created']);
    expect(await appointmentDetail('no-es-un-id')).toBeNull();
  });
});
