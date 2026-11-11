import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listCustomerAppointments, nextCustomerAppointment, readOwnAppointment } from '@/db/queries/appointments';
import { cancelOwn } from '@/lib/booking/cancel';
import { rescheduleOwn } from '@/lib/booking/reschedule';
import { getPool } from '@/db/client';
import { createAppointment, createCustomer, createPet, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { NOW } from './helpers/booking';

// Cada cliente solo ve y toca sus citas (FR-026, A9).

describe('autorización de las citas', () => {
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

  it('la lista solo devuelve las del cliente, con servicio y profesional', async () => {
    const a = await createCustomer({ email: 'a@example.test' });
    const b = await createCustomer();
    await createAppointment({ customerId: a.id, startsAt: madrid('2026-11-20', '10:00') });
    await createAppointment({ customerId: a.id, startsAt: madrid('2026-11-02', '10:00') });
    await createAppointment({ customerId: b.id, startsAt: madrid('2026-11-20', '11:00') });
    // Una cita de invitado con el mismo correo no es de la cuenta (Q2).
    await createAppointment({ contactEmail: 'a@example.test', startsAt: madrid('2026-11-21', '10:00') });
    const list = await listCustomerAppointments(a.id);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ serviceName: 'Consulta general', staffName: 'Dra. Nerea Olmedo' });
    expect(list.map((x) => x.startsAt.toISOString())).toEqual([madrid('2026-11-20', '10:00').toISOString(), madrid('2026-11-02', '10:00').toISOString()]);
    expect((await nextCustomerAppointment(a.id, NOW))?.startsAt.toISOString()).toBe(madrid('2026-11-20', '10:00').toISOString());
  });

  it('leer, cancelar o cambiar una cita ajena da not_found', async () => {
    const a = await createCustomer();
    const b = await createCustomer();
    const foreign = await createAppointment({ customerId: b.id, startsAt: madrid('2026-11-20', '10:00') });
    expect(await readOwnAppointment(a.id, foreign.id)).toBeNull();
    expect(await readOwnAppointment(a.id, 'no-es-un-id')).toBeNull();
    expect(await cancelOwn(a.id, foreign.id, { now: NOW })).toEqual({ status: 'not_found' });
    expect(await rescheduleOwn(a.id, foreign.id, { fecha: '2026-11-20', profesional: 'sin-preferencia', hora: '12:00' }, { now: NOW })).toEqual({
      status: 'not_found',
    });
    // Una de invitado tampoco es de nadie.
    const guest = await createAppointment({ startsAt: madrid('2026-11-20', '11:00') });
    expect(await cancelOwn(a.id, guest.id, { now: NOW })).toEqual({ status: 'not_found' });
    expect(await q("SELECT count(*)::int AS n FROM appointments WHERE status = 'confirmed'")).toEqual([{ n: 2 }]);
  });

  it('una mascota eliminada conserva su nombre en la lista', async () => {
    const a = await createCustomer();
    const pet = await createPet(a.id, { name: 'Bruno' });
    await createAppointment({ customerId: a.id, petId: pet.id, petName: 'Bruno', startsAt: madrid('2026-11-02', '10:00') });
    await getPool().query('DELETE FROM pets WHERE id = $1', [pet.id]);
    const [row] = await listCustomerAppointments(a.id);
    expect(row).toMatchObject({ petName: 'Bruno' });
    expect((await q('SELECT pet_id FROM appointments'))[0]).toEqual({ pet_id: null });
  });
});
