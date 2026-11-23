import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContentFile } from '@/content/load';
import { processDeletePet, processUpdatePet, readOwnPet } from '@/lib/account/pets';
import { logger } from '@/lib/logger';
import { createCustomer, createPet, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// SC-003 (A9): un cliente nunca puede ver, editar ni borrar la mascota de otro. La respuesta es la
// misma que si no existiera, y queda un registro sin datos personales.

const now = new Date('2026-11-11T10:00:00Z');

describe('autorización de mascotas (SC-003)', () => {
  beforeAll(async () => {
    const db = await setupTestDb();
    await truncateAll();
    await loadContentFile(db, 'content/petcare.yaml');
  });
  beforeEach(async () => {
    await resetAccountState();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  it('B no puede leer, editar ni eliminar la mascota de A', async () => {
    const a = await createCustomer({ firstName: 'Ana' });
    const b = await createCustomer({ firstName: 'Bea' });
    const pet = await createPet(a.id, { name: 'Toby', speciesKey: 'perro', birthDate: '2022-08-01' });
    const before = await q('SELECT * FROM pets WHERE id = $1', [pet.id]);
    const warn = vi.spyOn(logger, 'warn');

    expect(await readOwnPet(b.id, pet.id)).toBeNull();
    expect(await processUpdatePet(formData({ name: 'Robado', species: 'gato', birth_date: '2020-01-01' }), b.id, pet.id, { now })).toEqual({ status: 'not_found' });
    expect(await processDeletePet(b.id, pet.id)).toEqual({ status: 'not_found' });

    // La fila de A sigue intacta.
    expect(await q('SELECT * FROM pets WHERE id = $1', [pet.id])).toEqual(before);
    expect(await readOwnPet(a.id, pet.id)).toMatchObject({ name: 'Toby' });

    // Tres intentos registrados como pet_access_denied, con identificadores y sin datos personales.
    const denied = warn.mock.calls.filter((call) => call[1] === 'pet_access_denied');
    expect(denied).toHaveLength(3);
    for (const [fields] of denied) {
      expect(fields).toEqual(expect.objectContaining({ customer_id: b.id, pet_id: pet.id }));
      const text = JSON.stringify(fields);
      expect(text).not.toContain('Toby');
      expect(text).not.toContain('Robado');
      expect(text).not.toContain(a.email);
    }
  });

  it('un identificador que no es un UUID o no existe da lo mismo que una mascota ajena', async () => {
    const b = await createCustomer();
    expect(await readOwnPet(b.id, 'no-es-uuid')).toBeNull();
    expect(await processDeletePet(b.id, '00000000-0000-4000-8000-000000000000')).toEqual({ status: 'not_found' });
    expect(await processUpdatePet(formData({ name: 'X', species: 'perro', birth_date: '2020-01-01' }), b.id, "1' OR '1'='1", { now })).toEqual({ status: 'not_found' });
  });
});
