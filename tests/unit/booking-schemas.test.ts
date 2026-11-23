import { describe, expect, it } from 'vitest';
import { validateForm } from '@/domain/account-schemas';
import {
  BOOKING_MESSAGES,
  customerDetailsSchema,
  guestDetailsSchema,
  isValidPhone,
  parseBookingQuery,
  rescheduleOwnSchema,
} from '@/domain/booking-schemas';

const SPECIES = ['perro', 'gato'];
const CFG = {
  services: [
    { id: 's1', slug: 'consulta', name: 'Consulta', durationMinutes: 30, staffIds: ['a', 'b'] },
    { id: 's2', slug: 'cirugia', name: 'Cirugía', durationMinutes: 60, staffIds: ['b'] },
  ],
  staff: [
    { id: 'a', slug: 'ana', name: 'Ana', position: 0, hours: [] },
    { id: 'b', slug: 'bea', name: 'Bea', position: 1, hours: [] },
  ],
  today: '2026-11-16',
  lastDay: '2027-01-15',
};

const GUEST = {
  nombre_mascota: 'Lúa',
  especie: 'perro',
  nombre: 'Persona de Prueba',
  telefono: '600 123 456',
  correo: 'persona@example.com',
  motivo: '',
  privacidad: 'on',
};

describe('parseBookingQuery', () => {
  it('sin servicio, el paso 1', () => {
    expect(parseBookingQuery({}, CFG)).toMatchObject({ step: 1, service: null, errors: {} });
  });

  it('un servicio inexistente vuelve al paso 1 con el error', () => {
    expect(parseBookingQuery({ servicio: 'nada', profesional: 'sin-preferencia' }, CFG)).toMatchObject({
      step: 1,
      errors: { servicio: BOOKING_MESSAGES.servicio },
    });
  });

  it('un profesional que no atiende el servicio vuelve al paso 1', () => {
    expect(parseBookingQuery({ servicio: 'cirugia', profesional: 'ana' }, CFG)).toMatchObject({
      step: 1,
      errors: { profesional: BOOKING_MESSAGES.profesional },
    });
  });

  it('con servicio y profesional, el paso 2', () => {
    const q = parseBookingQuery({ servicio: 'consulta', profesional: 'sin-preferencia' }, CFG);
    expect(q).toMatchObject({ step: 2, staff: null, date: null });
    expect(q.service?.slug).toBe('consulta');
    expect(parseBookingQuery({ servicio: 'cirugia', profesional: 'bea' }, CFG).staff?.id).toBe('b');
  });

  it('una fecha fuera de la ventana da el error con la fecha máxima', () => {
    const q = parseBookingQuery({ servicio: 'consulta', profesional: 'ana', fecha: '2026-11-10' }, CFG);
    expect(q.step).toBe(2);
    expect(q.errors.fecha).toBe('Elige una fecha entre hoy y el 15 de enero de 2027.');
    expect(parseBookingQuery({ servicio: 'consulta', profesional: 'ana', fecha: '2027-02-30' }, CFG).errors.fecha).toBeDefined();
  });

  it('con fecha y hora, el paso 3; una hora mal escrita, el error', () => {
    expect(parseBookingQuery({ servicio: 'consulta', profesional: 'ana', fecha: '2026-11-17', hora: '10:00' }, CFG)).toMatchObject({
      step: 3,
      date: '2026-11-17',
      time: '10:00',
    });
    expect(parseBookingQuery({ servicio: 'consulta', profesional: 'ana', fecha: '2026-11-17', hora: '25:00' }, CFG)).toMatchObject({
      step: 2,
      errors: { hora: BOOKING_MESSAGES.hora },
    });
  });

  it('conserva ?mascota= y admite valores repetidos', () => {
    expect(parseBookingQuery({ mascota: 'abc', servicio: ['consulta', 'x'] }, CFG)).toMatchObject({ pet: 'abc', step: 1 });
  });
});

describe('guestDetailsSchema', () => {
  const v = (over: Record<string, string>) => validateForm(guestDetailsSchema(SPECIES), { ...GUEST, ...over });

  it('acepta unos datos válidos y "Otra" como especie (null)', () => {
    const r = v({ especie: 'other', motivo: '  ' });
    expect(r).toMatchObject({ ok: true, data: { especie: null, motivo: null, privacidad: true } });
  });

  it('da los mensajes de contracts/forms.md junto a cada campo', () => {
    const r = v({ nombre_mascota: '', especie: 'dragon', nombre: 'A', telefono: '12', correo: 'x', privacidad: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual({
      nombre_mascota: BOOKING_MESSAGES.nombre_mascota,
      especie: BOOKING_MESSAGES.especie,
      nombre: BOOKING_MESSAGES.nombre,
      telefono: BOOKING_MESSAGES.telefono,
      correo: BOOKING_MESSAGES.correo,
      privacidad: BOOKING_MESSAGES.privacidad,
    });
    expect(r.values.nombre).toBe('A');
  });

  it('limita el nombre de la mascota a 40 y el motivo a 500', () => {
    expect(v({ nombre_mascota: 'x'.repeat(41) }).ok).toBe(false);
    expect(v({ motivo: 'x'.repeat(501) })).toMatchObject({ ok: false, fieldErrors: { motivo: BOOKING_MESSAGES.motivo } });
  });

  it('la privacidad no vale si no es "on"', () => {
    expect(v({ privacidad: 'true' }).ok).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('pide 9 dígitos y solo admite [0-9 +()-]', () => {
    expect(isValidPhone('+34 (600) 123-456')).toBe(true);
    expect(isValidPhone('600 12 34')).toBe(false);
    expect(isValidPhone('600.123.456')).toBe(false);
    expect(isValidPhone('+ ( ) - - - - -')).toBe(false);
  });
});

describe('customerDetailsSchema', () => {
  const schema = (phoneRequired = false) => customerDetailsSchema(SPECIES, '2026-11-16', { phoneRequired });
  const PET = '6f1c2a40-1b2c-4d3e-8f90-123456789abc';

  it('con una mascota guardada no pide sus datos', () => {
    const r = validateForm(schema(), { mascota: PET, privacidad: 'on' });
    expect(r).toMatchObject({ ok: true, data: { mascota: PET, newPet: null, telefono: null, motivo: null } });
  });

  it('una mascota que no es un uuid ni "otra" da el error', () => {
    expect(validateForm(schema(), { mascota: '1; drop', privacidad: 'on' })).toMatchObject({
      ok: false,
      fieldErrors: { mascota: BOOKING_MESSAGES.mascota },
    });
  });

  it('con "otra" pide nombre, especie y la fecha con la regla de la 002', () => {
    const bad = validateForm(schema(), { mascota: 'otra', fecha_nacimiento: '2030-01-01', privacidad: 'on' });
    expect(bad).toMatchObject({
      ok: false,
      fieldErrors: {
        nombre_mascota: BOOKING_MESSAGES.nombre_mascota,
        especie: BOOKING_MESSAGES.especie,
        fecha_nacimiento: 'La fecha no puede ser futura.',
      },
    });
    const ok = validateForm(schema(), {
      mascota: 'otra',
      nombre_mascota: ' Nuba ',
      especie: 'other',
      fecha_nacimiento: '2020-05-01',
      privacidad: 'on',
    });
    expect(ok).toMatchObject({ ok: true, data: { newPet: { name: 'Nuba', speciesKey: null, birthDate: '2020-05-01' } } });
  });

  it('sin teléfono en la cuenta, el teléfono es obligatorio', () => {
    expect(validateForm(schema(true), { mascota: PET, privacidad: 'on' })).toMatchObject({
      ok: false,
      fieldErrors: { telefono: BOOKING_MESSAGES.telefono },
    });
    expect(validateForm(schema(true), { mascota: PET, telefono: '600123456', privacidad: 'on' })).toMatchObject({
      ok: true,
      data: { telefono: '600123456' },
    });
  });

  it('ignora el nombre y el correo que vengan en el formulario', () => {
    const r = validateForm(schema(), { mascota: PET, privacidad: 'on', nombre: 'Otro', correo: 'otro@example.com' });
    expect(r.ok && Object.keys(r.data)).toEqual(['mascota', 'newPet', 'telefono', 'motivo']);
  });
});

describe('rescheduleOwnSchema', () => {
  it('exige un id de cita uuid y una franja bien formada', () => {
    expect(rescheduleOwnSchema.safeParse({ cita: 'x', fecha: '2026-11-17', profesional: 'ana', hora: '10:00' }).success).toBe(false);
    expect(
      rescheduleOwnSchema.safeParse({ cita: '6f1c2a40-1b2c-4d3e-8f90-123456789abc', fecha: '2026-11-17', profesional: 'ana', hora: '10:00' })
        .success,
    ).toBe(true);
  });
});
