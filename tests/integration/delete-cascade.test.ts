import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { processDeleteAccount } from '@/lib/account/delete-account';
import { processDeletePet } from '@/lib/account/pets';
import { createAppointment, createCustomer, createPet, formData, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { NOW, TUESDAY } from './helpers/booking';

// Eliminar una mascota o la cuenta con citas (B12, FR-029).

describe('borrados con citas', () => {
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

  it('eliminar una mascota cancela sus citas futuras, avisa a la clínica y conserva las pasadas', async () => {
    const c = await createCustomer();
    const pet = await createPet(c.id, { name: 'Bruno' });
    const other = await createPet(c.id, { name: 'Nuba' });
    const future = await createAppointment({ customerId: c.id, petId: pet.id, petName: 'Bruno', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00') });
    const past = await createAppointment({ customerId: c.id, petId: pet.id, petName: 'Bruno', startsAt: madrid('2026-11-02', '10:00') });
    const otherPet = await createAppointment({ customerId: c.id, petId: other.id, petName: 'Nuba', staff: 'inigo-barral', startsAt: madrid(TUESDAY, '10:00') });
    let sent: string[] = [];

    expect(await processDeletePet(c.id, pet.id, { now: NOW, onEmails: (ids) => (sent = ids) })).toEqual({ status: 'ok' });
    const rows = new Map((await q('SELECT id, status, cancelled_by, pet_id, pet_name FROM appointments')).map((r) => [r.id, r]));
    expect(rows.get(future.id)).toMatchObject({ status: 'cancelled', cancelled_by: 'customer', pet_id: null, pet_name: 'Bruno' });
    expect(rows.get(past.id)).toMatchObject({ status: 'confirmed', pet_id: null, pet_name: 'Bruno' });
    expect(rows.get(otherPet.id)).toMatchObject({ status: 'confirmed', pet_id: other.id });
    expect((await q('SELECT kind FROM email_outbox')).map((r) => r.kind)).toEqual(['clinic_appointment']);
    expect(sent).toHaveLength(1);
  });

  it('una mascota ajena no se borra ni cancela nada', async () => {
    const a = await createCustomer();
    const b = await createCustomer();
    const pet = await createPet(b.id);
    await createAppointment({ customerId: b.id, petId: pet.id, startsAt: madrid(TUESDAY, '10:00') });
    expect(await processDeletePet(a.id, pet.id, { now: NOW })).toEqual({ status: 'not_found' });
    expect(await q("SELECT count(*)::int AS n FROM appointments WHERE status = 'confirmed'")).toEqual([{ n: 1 }]);
  });

  it('eliminar la cuenta cancela las futuras (system), sin correo al cliente, y anonimiza todas', async () => {
    const c = await createCustomer();
    const future = await createAppointment({ customerId: c.id, staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00'), reason: 'Privado' });
    const past = await createAppointment({ customerId: c.id, startsAt: madrid('2026-11-02', '10:00'), reason: 'Privado' });
    const { result, outboxIds } = await processDeleteAccount(formData({ current_password: c.password }), c, { ip: '203.0.113.1', now: NOW });
    expect(result).toEqual({ status: 'ok' });
    expect(outboxIds).toHaveLength(2);

    const rows = new Map((await q('SELECT * FROM appointments')).map((r) => [r.id, r]));
    expect(rows.get(future.id)).toMatchObject({ status: 'cancelled', cancelled_by: 'system' });
    for (const id of [future.id, past.id]) {
      expect(rows.get(id)).toMatchObject({
        customer_id: null,
        contact_name: null,
        contact_email: null,
        contact_email_normalized: null,
        contact_phone: null,
        reason: null,
      });
      expect(rows.get(id)!.anonymized_at).not.toBeNull();
    }
    const kinds = (await q('SELECT kind FROM email_outbox ORDER BY kind')).map((r) => r.kind);
    expect(kinds).toEqual(['account_deleted', 'clinic_appointment']);
    // La franja liberada vuelve a ofrecerse (ninguna confirmada ese día).
    expect(await q("SELECT count(*)::int AS n FROM appointments WHERE status = 'confirmed' AND starts_at > $1", [NOW])).toEqual([{ n: 0 }]);
  });
});
