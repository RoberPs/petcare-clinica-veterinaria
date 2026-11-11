import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bookAppointment } from '@/lib/booking/book';
import { createSubmissionToken } from '@/lib/form-token';
import { createAppointment, createCustomer, madrid, q, seedBookingConfig, setupTestDb, teardownTestDb, truncateAll, type BookingSeed } from './helpers/db';
import { ctxFor, guestForm, TUESDAY } from './helpers/booking';

// Reserva de invitado (US1, contracts/forms.md).

describe('reserva de invitado', () => {
  let seed: BookingSeed;

  beforeAll(async () => {
    await setupTestDb();
  });
  beforeEach(async () => {
    await truncateAll();
    seed = await seedBookingConfig();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('crea la cita con sus copias y 2 correos en la misma transacción', async () => {
    const r = await bookAppointment(guestForm(), ctxFor());
    expect(r).toMatchObject({ status: 'ok', created: true });
    if (r.status !== 'ok') return;
    expect(r.emailIds).toHaveLength(2);
    const [a] = await q('SELECT * FROM appointments');
    expect(a).toMatchObject({
      id: r.appointmentId,
      status: 'confirmed',
      booked_as: 'guest',
      customer_id: null,
      pet_name: 'Lúa',
      pet_species_label: 'Perro',
      contact_name: 'Persona de Prueba',
      contact_email: 'invitado@example.test',
      contact_email_normalized: 'invitado@example.test',
      contact_phone: '600 123 456',
      reason: 'Revisión anual',
      manage_version: 1,
    });
    expect(a!.starts_at.toISOString()).toBe(madrid(TUESDAY, '10:00').toISOString());
    expect(a!.ends_at.toISOString()).toBe(madrid(TUESDAY, '10:30').toISOString());
    expect(a!.privacy_version).not.toBe('desconocida');
    const emails = await q('SELECT kind, appointment_id, status FROM email_outbox ORDER BY kind');
    expect(emails).toEqual([
      { kind: 'appointment_confirmed', appointment_id: r.appointmentId, status: 'pending' },
      { kind: 'clinic_appointment', appointment_id: r.appointmentId, status: 'pending' },
    ]);
    const [clinicMail] = await q("SELECT payload FROM email_outbox WHERE kind = 'clinic_appointment'");
    expect(clinicMail!.payload.text).toContain('/gestion-cita/');
    expect(clinicMail!.payload.text).toContain('Revisión anual');
    const [guestMail] = await q("SELECT payload FROM email_outbox WHERE kind = 'appointment_confirmed'");
    expect(guestMail!.payload.text).not.toContain('Revisión anual');
    expect(guestMail!.payload.text).not.toContain('gestion-cita');
  });

  it('"Sin preferencia" asigna al que tiene menos citas ese día y, si empatan, por orden', async () => {
    // Empate (0 y 0): la primera del equipo.
    const first = await bookAppointment(guestForm({ correo: 'a@example.test' }), ctxFor());
    expect((await q('SELECT team_member_id FROM appointments'))[0]!.team_member_id).toBe(seed.staff.nerea);
    expect(first.status).toBe('ok');
    // Ahora Nerea tiene 1 y Íñigo 0: la siguiente va a Íñigo, aunque Nerea esté libre a esa hora.
    await bookAppointment(guestForm({ hora: '12:00', correo: 'b@example.test' }), ctxFor());
    const rows = await q("SELECT team_member_id FROM appointments ORDER BY starts_at");
    expect(rows.map((r) => r.team_member_id)).toEqual([seed.staff.nerea, seed.staff.inigo]);
  });

  it('un profesional concreto queda asignado', async () => {
    const r = await bookAppointment(guestForm({ profesional: 'inigo-barral' }), ctxFor());
    expect(r.status).toBe('ok');
    expect((await q('SELECT team_member_id FROM appointments'))[0]!.team_member_id).toBe(seed.staff.inigo);
  });

  it('un reenvío con el mismo submission no duplica la cita ni los correos', async () => {
    const form = guestForm();
    const r1 = await bookAppointment(form, ctxFor());
    const r2 = await bookAppointment(form, ctxFor());
    expect(r2).toMatchObject({ status: 'ok', created: false, emailIds: [] });
    expect(r1.status === 'ok' && r2.status === 'ok' && r1.appointmentId === r2.appointmentId).toBe(true);
    expect(await q('SELECT count(*)::int AS n FROM appointments')).toEqual([{ n: 1 }]);
    expect(await q('SELECT count(*)::int AS n FROM email_outbox')).toEqual([{ n: 2 }]);
  });

  it.each([
    ['un profesional que no atiende el servicio', { servicio: 'cirugia', profesional: 'nerea-olmedo' }, 'profesional'],
    ['una fecha pasada', { fecha: '2026-11-13' }, 'fecha'],
    ['una fecha fuera del horizonte', { fecha: '2027-01-20' }, 'fecha'],
    ['una hora fuera de la cuadrícula', { hora: '10:10' }, 'hora'],
    ['una hora de hoy sin la antelación mínima', { fecha: '2026-11-16', hora: '10:00' }, 'hora'],
    ['un día de cierre', { fecha: '2026-12-08' }, 'hora'],
    ['un servicio que no existe', { servicio: 'nada' }, 'servicio'],
  ])('%s da invalid', async (_name, overrides, field) => {
    const r = await bookAppointment(guestForm(overrides), ctxFor());
    expect(r.status).toBe('invalid');
    if (r.status === 'invalid') expect(Object.keys(r.fieldErrors)).toContain(field);
    expect(await q('SELECT count(*)::int AS n FROM appointments')).toEqual([{ n: 0 }]);
  });

  it('los errores de los datos vuelven con lo escrito (sin el token)', async () => {
    const r = await bookAppointment(guestForm({ correo: 'no-es-un-correo', privacidad: undefined }), ctxFor());
    expect(r).toMatchObject({ status: 'invalid', fieldErrors: { correo: expect.any(String), privacidad: expect.any(String) } });
    if (r.status !== 'invalid') return;
    expect(r.values.nombre).toBe('Persona de Prueba');
    expect(r.values.submission).toBeUndefined();
  });

  it('una hora que ya está ocupada da slot_taken con los datos escritos', async () => {
    await createAppointment({ service: 'cirugia', staff: 'inigo-barral', startsAt: madrid(TUESDAY, '10:00') });
    const r = await bookAppointment(guestForm({ servicio: 'cirugia', profesional: 'inigo-barral' }), ctxFor());
    expect(r).toMatchObject({ status: 'slot_taken', values: { nombre: 'Persona de Prueba', hora: '10:00' } });
    expect(await q('SELECT count(*)::int AS n FROM appointments')).toEqual([{ n: 1 }]);
  });

  it('el campo trampa y un token demasiado rápido no crean nada (éxito aparente)', async () => {
    expect(await bookAppointment(guestForm({ web: 'https://spam.example' }), ctxFor())).toMatchObject({ status: 'ok', appointmentId: null });
    expect(await bookAppointment(guestForm({ submission: createSubmissionToken(new Date()) }), ctxFor())).toMatchObject({
      status: 'ok',
      appointmentId: null,
    });
    expect(await q('SELECT count(*)::int AS n FROM appointments')).toEqual([{ n: 0 }]);
    expect(await q('SELECT count(*)::int AS n FROM email_outbox')).toEqual([{ n: 0 }]);
  });

  it('un token manipulado da expired', async () => {
    expect(await bookAppointment(guestForm({ submission: 'x.y' }), ctxFor())).toEqual({ status: 'expired' });
  });

  it('un invitado con el correo de una cuenta: misma respuesta, cita sin cuenta y la línea de iniciar sesión', async () => {
    const customer = await createCustomer({ email: 'Cliente@Example.test' });
    const r = await bookAppointment(guestForm({ correo: 'cliente@example.TEST' }), ctxFor());
    expect(r).toMatchObject({ status: 'ok', created: true });
    expect((await q('SELECT customer_id, booked_as FROM appointments'))[0]).toEqual({ customer_id: null, booked_as: 'guest' });
    const [mail] = await q("SELECT payload FROM email_outbox WHERE kind = 'appointment_confirmed'");
    expect(mail!.payload.text).toContain('inicia sesión');
    expect(customer.id).toBeTruthy();
  });
});
