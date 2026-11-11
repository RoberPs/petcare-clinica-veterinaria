import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { handleExportRequest } from '@/lib/account/export';
import { getPool } from '@/db/client';
import {
  createAppointment,
  createCustomer,
  createPet,
  createSessionFor,
  madrid,
  q,
  resetAccountState,
  setupTestDb,
  teardownTestDb,
  truncateAll,
} from './helpers/db';

// "Descargar mis datos" (US7, SC-008): todo lo del cliente y nada de otra cuenta.

const HOST = 'petcare.example';
function exportRequest(cookie: string | null, headers: Record<string, string> = { origin: `https://${HOST}`, 'sec-fetch-site': 'same-origin' }) {
  return new Request(`https://${HOST}/api/account/export`, {
    method: 'POST',
    headers: { host: HOST, ...(cookie ? { cookie: `pc_session=${cookie}` } : {}), ...headers },
  });
}

describe('descargar mis datos (US7)', () => {
  beforeAll(async () => {
    const db = await setupTestDb();
    await truncateAll();
    await loadContentFile(db, 'content/petcare.yaml');
  });
  beforeEach(async () => {
    await resetAccountState();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('devuelve un JSON descargable con todas las columnas de usuario de customers y pets', async () => {
    const c = await createCustomer({ firstName: 'Ana', lastName: 'Exportada', phone: '600 123 456', marketingOptIn: true });
    await getPool().query(
      `UPDATE customers SET address_line = 'Calle Única 7', postal_code = '28001', city = 'Villaprueba', province = 'Provinciaprueba',
         marketing_opt_in_changed_at = now() WHERE id = $1`,
      [c.id],
    );
    await createPet(c.id, { name: 'Toby', speciesKey: 'perro', birthDate: '2022-08-01' });
    await createPet(c.id, { name: 'Pío', speciesKey: null, birthDate: '2024-03-03' });
    const other = await createCustomer({ firstName: 'Otra', lastName: 'Persona' });
    await createPet(other.id, { name: 'Ajena' });
    const token = await createSessionFor(c.id);

    const res = await handleExportRequest(exportRequest(token), new Date());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="mis-datos-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const text = await res.text();
    expect(text).toContain('\n  "format_version": 1');
    const data = JSON.parse(text);

    // Cada columna de usuario de customers aparece con su valor.
    const [row] = await q('SELECT * FROM customers WHERE id = $1', [c.id]);
    const internal = new Set(['id', 'email_normalized', 'password_hash']);
    const flat = JSON.stringify(data);
    for (const [column, value] of Object.entries(row!)) {
      if (internal.has(column) || value === null) continue;
      const expected = value instanceof Date ? value.toISOString() : String(value);
      expect(flat, `customers.${column}`).toContain(typeof value === 'boolean' ? `"marketing_opt_in":${value}` : expected);
    }
    // Y cada columna de usuario de pets.
    const pets = await q("SELECT name, species_key, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, created_at FROM pets WHERE customer_id = $1", [c.id]);
    for (const p of pets) {
      expect(data.pets).toContainEqual(
        expect.objectContaining({ name: p.name, species_key: p.species_key, birth_date: p.birth_date, created_at: p.created_at.toISOString() }),
      );
    }
    expect(data.consents).toEqual([expect.objectContaining({ kind: 'privacy_terms' })]);
    expect(data.controller.contact_email).toBe(process.env.LEGAL_CONTACT_EMAIL);

    // Nada de otra cuenta ni de seguridad.
    expect(flat).not.toContain('Ajena');
    expect(flat).not.toContain(other.email);
    expect(flat).not.toContain(c.id);
    expect(flat).not.toContain('argon2');
  });

  it('incluye solo las citas de la cuenta (no las de invitado con el mismo correo, Q2)', async () => {
    const c = await createCustomer({ email: 'exporta-citas@example.test' });
    const pet = await createPet(c.id, { name: 'Toby' });
    await createAppointment({ customerId: c.id, petId: pet.id, petName: 'Toby', startsAt: madrid('2026-12-01', '10:00'), reason: 'Revisión' });
    await createAppointment({ contactEmail: 'exporta-citas@example.test', petName: 'Invitada', startsAt: madrid('2026-12-02', '10:00') });
    const res = await handleExportRequest(exportRequest(await createSessionFor(c.id)), new Date());
    const data = JSON.parse(await res.text());
    expect(data.citas).toHaveLength(1);
    expect(data.citas[0]).toMatchObject({ mascota: 'Toby', servicio: 'Consulta general', motivo: 'Revisión', inicio: '2026-12-01T10:00:00+01:00' });
  });

  it('sin sesión redirige a iniciar sesión', async () => {
    const res = await handleExportRequest(exportRequest(null), new Date());
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/iniciar-sesion?return_to=%2Fmi-cuenta%2Fdatos');
  });

  it('rechaza un Origin ajeno (CSRF)', async () => {
    const c = await createCustomer();
    const token = await createSessionFor(c.id);
    const res = await handleExportRequest(exportRequest(token, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }), new Date());
    expect(res.status).toBe(403);
    const none = await handleExportRequest(exportRequest(token, {}), new Date());
    expect(none.status).toBe(403);
  });
});
