import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bookAppointment } from '@/lib/booking/book';
import { createAppointment, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { ctxFor, guestForm, NOW } from './helpers/booking';

// Anti-abuso de la reserva (B9, FR-016).

const HOURS = ['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30'];

describe('límites de la reserva', () => {
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

  it('la sexta reserva desde el mismo origen en 10 minutos da rate_limited', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await bookAppointment(guestForm({ hora: HOURS[i], correo: `origen-${i}@example.test` }), ctxFor('203.0.113.50'));
      expect(r.status).toBe('ok');
    }
    const sixth = await bookAppointment(guestForm({ hora: HOURS[5], correo: 'origen-5@example.test' }), ctxFor('203.0.113.50'));
    expect(sixth).toMatchObject({ status: 'rate_limited', retryMinutes: 10 });
    // Otro origen sí puede.
    expect((await bookAppointment(guestForm({ hora: HOURS[5], correo: 'otra@example.test' }), ctxFor('203.0.113.51'))).status).toBe('ok');
    // Pasados 10 minutos, vuelve a haber hueco.
    const later = new Date(NOW.getTime() + 11 * 60_000);
    const r = await bookAppointment(guestForm({ hora: HOURS[6], correo: 'tarde@example.test' }), ctxFor('203.0.113.50', later));
    expect(r.status).toBe('ok');
  });

  it('un envío no válido no gasta el límite', async () => {
    for (let i = 0; i < 6; i++) {
      expect((await bookAppointment(guestForm({ correo: 'mal' }), ctxFor('203.0.113.60'))).status).toBe('invalid');
    }
    expect((await bookAppointment(guestForm(), ctxFor('203.0.113.60'))).status).toBe('ok');
  });

  it('la cuarta cita futura con el mismo correo de invitado da limit_reached (sin distinguir mayúsculas)', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await bookAppointment(guestForm({ hora: HOURS[i], correo: i === 1 ? 'Repetido@Example.TEST' : 'repetido@example.test' }), ctxFor(`203.0.113.${70 + i}`));
      expect(r.status).toBe('ok');
    }
    const fourth = await bookAppointment(guestForm({ hora: HOURS[3], correo: ' REPETIDO@example.test ' }), ctxFor('203.0.113.80'));
    expect(fourth).toEqual({ status: 'limit_reached' });
  });

  it('una cita cancelada o pasada no cuenta para el límite', async () => {
    const email = 'cuenta-limite@example.test';
    await createAppointment({ contactEmail: email, startsAt: madrid('2026-11-18', '10:00') });
    await createAppointment({ contactEmail: email, startsAt: madrid('2026-11-18', '11:00') });
    await createAppointment({ contactEmail: email, startsAt: madrid('2026-11-18', '12:00'), status: 'cancelled' });
    await createAppointment({ contactEmail: email, startsAt: madrid('2026-11-02', '12:00'), createdAt: madrid('2026-10-01', '10:00') });
    expect((await bookAppointment(guestForm({ correo: email }), ctxFor())).status).toBe('ok');
    expect((await bookAppointment(guestForm({ correo: email, hora: '12:00' }), ctxFor('203.0.113.90'))).status).toBe('limit_reached');
    expect(await q("SELECT count(*)::int AS n FROM appointments WHERE status = 'confirmed' AND starts_at > $1", [NOW])).toEqual([{ n: 3 }]);
  });
});
