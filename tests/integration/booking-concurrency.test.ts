import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bookAppointment } from '@/lib/booking/book';
import { createAppointment, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { ctxFor, guestForm, TUESDAY } from './helpers/booking';

// Sin dobles reservas (B2, SC-002).

describe('concurrencia de reservas', () => {
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

  // Cada intento con su propio origen y correo, para que no salten los límites.
  const attempt = (i: number, overrides: Record<string, string>) =>
    bookAppointment(guestForm({ correo: `concurrente-${i}@example.test`, ...overrides }), ctxFor(`198.51.100.${i + 1}`));

  it('20 reservas simultáneas a la misma hora y profesional: 1 confirmada y 19 slot_taken', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => attempt(i, { profesional: 'inigo-barral' })));
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'slot_taken')).toHaveLength(19);
    expect(await q("SELECT count(*)::int AS n FROM appointments WHERE status = 'confirmed'")).toEqual([{ n: 1 }]);
    expect(await q('SELECT count(*)::int AS n FROM email_outbox')).toEqual([{ n: 2 }]);
  });

  it('20 simultáneas con "Sin preferencia" y 2 profesionales: 2 confirmadas, una para cada uno', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => attempt(i, { profesional: 'sin-preferencia' })));
    expect(results.filter((r) => r.status === 'ok')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'slot_taken')).toHaveLength(18);
    const staff = await q('SELECT DISTINCT team_member_id FROM appointments');
    expect(staff).toHaveLength(2);
  });

  it('un INSERT directo solapado viola appointments_no_overlap', async () => {
    await createAppointment({ service: 'cirugia', staff: 'inigo-barral', startsAt: madrid(TUESDAY, '10:00') });
    await expect(
      createAppointment({ service: 'consulta-general', staff: 'inigo-barral', startsAt: madrid(TUESDAY, '10:30') }),
    ).rejects.toMatchObject({ code: '23P01', constraint: 'appointments_no_overlap' });
    // Una cancelada no ocupa y dos profesionales distintos pueden coincidir.
    await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:30') });
    await createAppointment({ service: 'consulta-general', staff: 'inigo-barral', startsAt: madrid(TUESDAY, '10:30'), status: 'cancelled' });
    // Termina justo cuando empieza la siguiente: no se solapan ([) ).
    await createAppointment({ service: 'consulta-general', staff: 'inigo-barral', startsAt: madrid(TUESDAY, '11:00') });
    expect(await q('SELECT count(*)::int AS n FROM appointments')).toEqual([{ n: 4 }]);
  });
});
