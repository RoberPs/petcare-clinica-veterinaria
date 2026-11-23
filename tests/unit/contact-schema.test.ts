import { describe, expect, it } from 'vitest';
import { MESSAGES, validateContact } from '@/domain/contact-schema';

const valid = {
  nombre: '  Lucía  ',
  telefono: '',
  email: 'Lucia@Correo.ES',
  motivo: 'informacion-general',
  mensaje: 'Quería preguntar por la vacuna.',
  privacidad: 'on',
};

const errorsOf = (input: Record<string, unknown>) => {
  const r = validateContact(input);
  return r.ok ? {} : r.fieldErrors;
};

describe('validación del formulario de contacto', () => {
  it('acepta un envío válido, recorta y normaliza', () => {
    const r = validateContact(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nombre).toBe('Lucía');
    expect(r.data.telefono).toBeNull();
    expect(r.data.email).toBe('Lucia@correo.es');
  });

  it('nombre obligatorio', () => {
    expect(errorsOf({ ...valid, nombre: '   ' }).nombre).toBe(MESSAGES.nombre);
  });

  it('teléfono opcional, pero si viene debe ser válido', () => {
    expect(validateContact({ ...valid, telefono: '+34 600 11 22 33' }).ok).toBe(true);
    expect(validateContact({ ...valid, telefono: '(91) 123 45 67' }).ok).toBe(true);
    expect(errorsOf({ ...valid, telefono: '600-11-22' }).telefono).toBe(MESSAGES.telefono);
    expect(errorsOf({ ...valid, telefono: '1234' }).telefono).toBe(MESSAGES.telefono);
    expect(errorsOf({ ...valid, telefono: '1'.repeat(21) }).telefono).toBe(MESSAGES.telefono);
  });

  it('correo inválido', () => {
    for (const email of ['', 'sin-arroba', 'a@b', 'a b@c.es', `${'a'.repeat(250)}@c.es`]) {
      expect(errorsOf({ ...valid, email }).email).toBe(MESSAGES.email);
    }
  });

  it('motivo obligatorio', () => {
    expect(errorsOf({ ...valid, motivo: '' }).motivo).toBe(MESSAGES.motivo);
  });

  it('mensaje de 10 a 2.000 caracteres', () => {
    expect(errorsOf({ ...valid, mensaje: 'corto' }).mensaje).toBe(MESSAGES.mensajeMin);
    expect(errorsOf({ ...valid, mensaje: 'x'.repeat(2001) }).mensaje).toBe(MESSAGES.mensajeMax);
    expect(validateContact({ ...valid, mensaje: 'x'.repeat(2000) }).ok).toBe(true);
  });

  it('privacidad obligatoria', () => {
    expect(errorsOf({ ...valid, privacidad: undefined }).privacidad).toBe(MESSAGES.privacidad);
  });

  it('devuelve los valores escritos para volver a pintarlos', () => {
    const r = validateContact({ ...valid, email: 'mal' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.values).toMatchObject({ nombre: '  Lucía  ', email: 'mal', mensaje: valid.mensaje });
  });
});
