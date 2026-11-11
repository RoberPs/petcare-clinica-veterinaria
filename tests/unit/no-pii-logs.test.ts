import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// FR-037 y principio IV: los logs de las cuentas solo llevan identificadores y códigos. Se revisan
// todas las llamadas al logger de src/lib/account y src/lib/auth, y desde la 003 (FR-033) las de
// src/lib/booking.

const FORBIDDEN = ['email', 'first_name', 'last_name', 'phone', 'password', 'name', 'token', 'firstName', 'lastName', 'address', 'birth_date'];
/** Datos de la cita que nunca van al log (FR-033). */
const BOOKING_FORBIDDEN = [
  ...FORBIDDEN,
  'contact_name',
  'contact_email',
  'contact_phone',
  'contactName',
  'contactEmail',
  'contactPhone',
  'reason',
  'motivo',
  'pet_name',
  'petName',
  'correo',
  'telefono',
  'nombre',
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

/** Claves del primer argumento (un objeto literal) de cada llamada logger.x({ … }, 'evento'). */
function loggedKeys(source: string): { keys: string[]; call: string }[] {
  const calls: { keys: string[]; call: string }[] = [];
  for (const m of source.matchAll(/logger\.(?:trace|debug|info|warn|error|fatal)\(\s*\{([^}]*)\}/g)) {
    const body = m[1]!;
    const keys = body
      .split(',')
      .map((part) => part.trim().split(/\s*:/)[0]!.replace(/^\.\.\./, '').trim())
      .filter(Boolean);
    calls.push({ keys, call: m[0] });
  }
  return calls;
}

describe('sin datos personales en los logs de las citas (feature 003)', () => {
  const sources = files('src/lib/booking').map((f) => ({ f, text: readFileSync(f, 'utf8') }));

  it('hay llamadas al logger que revisar', () => {
    expect(sources.reduce((n, s) => n + loggedKeys(s.text).length, 0)).toBeGreaterThan(8);
  });

  it('ninguna llamada registra datos de contacto, el motivo, la mascota ni el token', () => {
    const offending = sources.flatMap(({ f, text }) =>
      loggedKeys(text)
        .filter(({ keys }) => keys.some((k) => BOOKING_FORBIDDEN.includes(k)))
        .map(({ call }) => `${f}: ${call}`),
    );
    expect(offending).toEqual([]);
  });

  it('nadie pasa al logger un objeto entero ni el token', () => {
    const whole = sources.flatMap(({ f, text }) =>
      [...text.matchAll(/logger\.\w+\(\s*(?!\{)([A-Za-z_][\w.]*)\s*[,)]/g)].map((m) => `${f}: ${m[0]}`),
    );
    expect(whole).toEqual([]);
    const withToken = sources.flatMap(({ f, text }) => loggedKeys(text).filter(({ call }) => /\btoken\b/.test(call)).map(({ call }) => `${f}: ${call}`));
    expect(withToken).toEqual([]);
  });
});

describe('sin datos personales en los logs de cuentas', () => {
  const sources = [...files('src/lib/account'), ...files('src/lib/auth')].map((f) => ({ f, text: readFileSync(f, 'utf8') }));

  it('hay llamadas al logger que revisar', () => {
    expect(sources.reduce((n, s) => n + loggedKeys(s.text).length, 0)).toBeGreaterThan(15);
  });

  it('ninguna llamada registra campos personales ni secretos', () => {
    const offending = sources.flatMap(({ f, text }) =>
      loggedKeys(text)
        .filter(({ keys }) => keys.some((k) => FORBIDDEN.includes(k)))
        .map(({ call }) => `${f}: ${call}`),
    );
    expect(offending).toEqual([]);
  });

  it('nadie pasa al logger un objeto entero (cliente, formulario o error)', () => {
    const whole = sources.flatMap(({ f, text }) =>
      [...text.matchAll(/logger\.\w+\(\s*(?!\{)([A-Za-z_][\w.]*)\s*[,)]/g)].map((m) => `${f}: ${m[0]}`),
    );
    expect(whole).toEqual([]);
  });
});
