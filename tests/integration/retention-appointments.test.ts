import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb, getPool } from '@/db/client';
import { purgeExpired } from '@/db/retention';
import { createAppointment, createCustomer, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Conservación de las citas (FR-030, B12).

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

describe('retención de las citas', () => {
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

  it('anonimiza las citas de invitado de hace más de 12 meses y no toca el resto', async () => {
    const oldGuest = await createAppointment({ startsAt: daysAgo(400), reason: 'Privado' });
    const recentGuest = await createAppointment({ startsAt: daysAgo(300), reason: 'Privado' });
    const c = await createCustomer();
    const oldCustomer = await createAppointment({ customerId: c.id, startsAt: daysAgo(500), staff: 'inigo-barral' });

    const r = await purgeExpired(getDb());
    expect(r.guestAppointments).toBe(1);
    const rows = new Map((await q('SELECT * FROM appointments')).map((x) => [x.id, x]));
    expect(rows.get(oldGuest.id)).toMatchObject({ contact_name: null, contact_email: null, contact_phone: null, reason: null });
    expect(rows.get(oldGuest.id)!.anonymized_at).not.toBeNull();
    // La ocupación histórica se conserva.
    expect(rows.get(oldGuest.id)).toMatchObject({ pet_name: 'Mascota de prueba', status: 'confirmed' });
    expect(rows.get(recentGuest.id)).toMatchObject({ contact_name: 'Persona de Prueba', reason: 'Privado', anonymized_at: null });
    expect(rows.get(oldCustomer.id)).toMatchObject({ contact_name: 'Persona de Prueba', anonymized_at: null });
    // Una segunda pasada no vuelve a contarla.
    expect((await purgeExpired(getDb())).guestAppointments).toBe(0);
  });

  it('respeta retention_months del archivo de contenido', async () => {
    await truncateAll();
    await seedBookingConfig((c) => (c.booking.rules = { retention_months: 6 }));
    const a = await createAppointment({ startsAt: daysAgo(200) });
    expect((await purgeExpired(getDb())).guestAppointments).toBe(1);
    expect((await q('SELECT contact_email FROM appointments WHERE id = $1', [a.id]))[0]).toEqual({ contact_email: null });
  });

  it('borra los correos de cita no pendientes a las 24 h y conserva los pendientes', async () => {
    const a = await createAppointment({ startsAt: daysAgo(-3) });
    const insert = (status: string, createdAt: Date) =>
      getPool().query(
        `INSERT INTO email_outbox (kind, appointment_id, recipient_hash, status, payload, created_at)
         VALUES ('appointment_confirmed', $1, 'h', $2, $3, $4)`,
        [a.id, status, status === 'pending' ? JSON.stringify({ to: { email: 'x@example.test' }, subject: 's', html: 'h', text: 't' }) : null, createdAt],
      );
    await insert('sent', daysAgo(2));
    await insert('sent', new Date());
    await insert('pending', daysAgo(2));
    await purgeExpired(getDb());
    expect((await q('SELECT status FROM email_outbox ORDER BY status')).map((r) => r.status)).toEqual(['pending', 'sent']);
  });
});
