import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BOOKING_MESSAGES } from '@/domain/booking-schemas';
import { bookAppointment, type BookingCustomer } from '@/lib/booking/book';
import { MAX_PETS } from '@/lib/account/pets';
import { createAppointment, createCustomer, createPet, formData, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';
import { ctxFor, freshToken, TUESDAY } from './helpers/booking';

// Reserva con sesión iniciada (US2, FR-011 y FR-012).

const customerForm = (values: Record<string, string | undefined>) =>
  formData({
    servicio: 'consulta-general',
    profesional: 'sin-preferencia',
    fecha: TUESDAY,
    hora: '10:00',
    submission: freshToken(),
    privacidad: 'on',
    ...values,
  });

async function customer(phone: string | null = '600 111 222'): Promise<BookingCustomer> {
  const c = await createCustomer({ firstName: 'Lucía', lastName: 'Cliente', phone });
  return { id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName, phone };
}

describe('reserva con sesión iniciada', () => {
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

  it('con una mascota propia la cita queda con customer_id, pet_id y los datos de la cuenta', async () => {
    const c = await customer();
    const pet = await createPet(c.id, { name: 'Bruno' });
    // El nombre y el correo que traiga el formulario se ignoran.
    const r = await bookAppointment(customerForm({ mascota: pet.id, nombre: 'Otro Nombre', correo: 'otro@example.test' }), { ...ctxFor(), customer: c });
    expect(r).toMatchObject({ status: 'ok', created: true });
    expect((await q('SELECT * FROM appointments'))[0]).toMatchObject({
      booked_as: 'customer',
      customer_id: c.id,
      pet_id: pet.id,
      pet_name: 'Bruno',
      pet_species_label: 'Perro',
      contact_name: 'Lucía Cliente',
      contact_email: c.email,
      contact_phone: '600 111 222',
    });
    const [mail] = await q("SELECT payload FROM email_outbox WHERE kind = 'appointment_confirmed'");
    expect(mail!.payload.to.email).toBe(c.email);
    expect(mail!.payload.text).toContain('/mi-cuenta/citas');
  });

  it('con una mascota ajena da not_found y no crea nada', async () => {
    const c = await customer();
    const other = await createCustomer();
    const foreign = await createPet(other.id, { name: 'Ajena' });
    expect(await bookAppointment(customerForm({ mascota: foreign.id }), { ...ctxFor(), customer: c })).toEqual({ status: 'not_found' });
    expect(await q('SELECT count(*)::int AS n FROM appointments')).toEqual([{ n: 0 }]);
  });

  it('con "Otra mascota" crea la mascota y la cita en la misma transacción', async () => {
    const c = await customer();
    const r = await bookAppointment(
      customerForm({ mascota: 'otra', nombre_mascota: 'Nuba', especie: 'gato', fecha_nacimiento: '2021-03-04' }),
      { ...ctxFor(), customer: c },
    );
    expect(r.status).toBe('ok');
    const [pet] = await q('SELECT id, name, species_key, birth_date FROM pets WHERE customer_id = $1', [c.id]);
    expect(pet).toMatchObject({ name: 'Nuba', species_key: 'gato' });
    expect((await q('SELECT pet_id, pet_name, pet_species_label FROM appointments'))[0]).toEqual({
      pet_id: pet!.id,
      pet_name: 'Nuba',
      pet_species_label: 'Gato',
    });
  });

  it('si la hora se ocupa, la mascota nueva tampoco se crea', async () => {
    const c = await customer();
    await createAppointment({ service: 'consulta-general', staff: 'nerea-olmedo', startsAt: madrid(TUESDAY, '10:00') });
    const r = await bookAppointment(
      customerForm({ profesional: 'nerea-olmedo', mascota: 'otra', nombre_mascota: 'Nuba', especie: 'gato', fecha_nacimiento: '2021-03-04' }),
      { ...ctxFor(), customer: c },
    );
    expect(r.status).toBe('slot_taken');
    expect(await q('SELECT count(*)::int AS n FROM pets')).toEqual([{ n: 0 }]);
  });

  it(`"Otra mascota" respeta el máximo de ${MAX_PETS} mascotas`, async () => {
    const c = await customer();
    for (let i = 0; i < MAX_PETS; i++) await createPet(c.id, { name: `M${i}` });
    const r = await bookAppointment(
      customerForm({ mascota: 'otra', nombre_mascota: 'Una más', especie: 'perro', fecha_nacimiento: '2021-03-04' }),
      { ...ctxFor(), customer: c },
    );
    expect(r).toMatchObject({ status: 'invalid', fieldErrors: { mascota: expect.stringContaining(`${MAX_PETS} mascotas`) } });
    expect(await q('SELECT count(*)::int AS n FROM appointments')).toEqual([{ n: 0 }]);
  });

  it('sin teléfono en la cuenta, el teléfono es obligatorio y no se guarda en la cuenta', async () => {
    const c = await customer(null);
    const pet = await createPet(c.id);
    expect(await bookAppointment(customerForm({ mascota: pet.id }), { ...ctxFor(), customer: c })).toMatchObject({
      status: 'invalid',
      fieldErrors: { telefono: BOOKING_MESSAGES.telefono },
    });
    expect((await bookAppointment(customerForm({ mascota: pet.id, telefono: '611 222 333' }), { ...ctxFor(), customer: c })).status).toBe('ok');
    expect((await q('SELECT contact_phone FROM appointments'))[0]).toEqual({ contact_phone: '611 222 333' });
    expect(await q('SELECT phone FROM customers WHERE id = $1', [c.id])).toEqual([{ phone: null }]);
  });

  it('el límite de 9 citas activas por cliente', async () => {
    const c = await customer();
    const pet = await createPet(c.id);
    for (let i = 0; i < 9; i++) {
      await createAppointment({ customerId: c.id, petId: pet.id, startsAt: madrid('2026-11-18', `${String(9 + Math.floor(i / 2) + 1).padStart(2, '0')}:${i % 2 ? '30' : '00'}`), staff: i % 2 ? 'inigo-barral' : 'nerea-olmedo' });
    }
    expect(await bookAppointment(customerForm({ mascota: pet.id }), { ...ctxFor(), customer: c })).toEqual({ status: 'limit_reached' });
  });
});
