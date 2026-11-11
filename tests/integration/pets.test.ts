import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadContentFile } from '@/content/load';
import { ACCOUNT_MESSAGES } from '@/domain/account-schemas';
import { listPets } from '@/db/queries/pets';
import { MAX_PETS, processCreatePet, processDeletePet, processUpdatePet } from '@/lib/account/pets';
import { createSubmissionToken } from '@/lib/form-token';
import { createCustomer, createPet, formData, q, resetAccountState, setupTestDb, teardownTestDb, truncateAll } from './helpers/db';

// Mascotas (US3, FR-022 a FR-026, A9 y A10).

const now = new Date('2026-11-11T10:00:00Z');
const petForm = (values: Record<string, string | undefined> = {}) =>
  formData({ name: 'Rex', species: 'perro', birth_date: '2022-08-01', submission_token: createSubmissionToken(now), ...values });

describe('mascotas (US3)', () => {
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

  it('crea, edita y elimina una mascota', async () => {
    const c = await createCustomer();
    expect(await processCreatePet(petForm(), c.id, { now })).toEqual({ status: 'ok' });
    const [pet] = await listPets(c.id);
    expect(pet).toMatchObject({ name: 'Rex', speciesKey: 'perro', speciesLabel: 'Perro', birthDate: '2022-08-01' });

    expect(await processUpdatePet(formData({ name: 'Rex II', species: 'gato', birth_date: '2023-01-15' }), c.id, pet!.id, { now })).toEqual({ status: 'ok' });
    expect((await listPets(c.id))[0]).toMatchObject({ name: 'Rex II', speciesKey: 'gato', birthDate: '2023-01-15' });

    expect(await processDeletePet(c.id, pet!.id)).toEqual({ status: 'ok' });
    expect(await listPets(c.id)).toEqual([]);
  });

  it('la especie "Otra" se guarda como NULL', async () => {
    const c = await createCustomer();
    await processCreatePet(petForm({ name: 'Pío', species: 'other' }), c.id, { now });
    expect(await q('SELECT species_key FROM pets')).toEqual([{ species_key: null }]);
    expect((await listPets(c.id))[0]).toMatchObject({ speciesKey: null, speciesLabel: null });
  });

  it('rechaza una especie inexistente, una fecha futura y una de hace más de 40 años', async () => {
    const c = await createCustomer();
    const bad = async (values: Record<string, string>) => processCreatePet(petForm(values), c.id, { now });
    expect(await bad({ species: 'dragon' })).toMatchObject({ status: 'invalid', fieldErrors: { species: ACCOUNT_MESSAGES.species } });
    expect(await bad({ birth_date: '2026-11-12' })).toMatchObject({ status: 'invalid', fieldErrors: { birth_date: ACCOUNT_MESSAGES.birth_date_future } });
    expect(await bad({ birth_date: '1986-11-10' })).toMatchObject({ status: 'invalid', fieldErrors: { birth_date: ACCOUNT_MESSAGES.birth_date_too_old } });
    const invalid = await bad({ name: '', species: 'dragon' });
    expect(invalid).toMatchObject({ status: 'invalid', values: { species: 'dragon' } });
    expect(await q('SELECT id FROM pets')).toEqual([]);
  });

  it(`no deja pasar de ${MAX_PETS} mascotas, tampoco con dos altas a la vez`, async () => {
    const c = await createCustomer();
    for (let i = 0; i < MAX_PETS - 1; i++) await createPet(c.id, { name: `M${String(i).padStart(2, '0')}` });
    const [a, b] = await Promise.all([
      processCreatePet(petForm({ name: 'Ultima A' }), c.id, { now }),
      processCreatePet(petForm({ name: 'Ultima B' }), c.id, { now }),
    ]);
    expect([a.status, b.status].sort()).toEqual(['limit_reached', 'ok']);
    expect(await q('SELECT count(*)::int AS n FROM pets')).toEqual([{ n: MAX_PETS }]);
    expect((await processCreatePet(petForm(), c.id, { now })).status).toBe('limit_reached');
  });

  it('un doble envío con el mismo submission_id crea una sola mascota', async () => {
    const c = await createCustomer();
    const token = createSubmissionToken(now);
    expect(await processCreatePet(petForm({ submission_token: token }), c.id, { now })).toEqual({ status: 'ok' });
    expect(await processCreatePet(petForm({ submission_token: token }), c.id, { now })).toEqual({ status: 'ok' });
    expect(await q('SELECT count(*)::int AS n FROM pets')).toEqual([{ n: 1 }]);
  });

  it('un token de formulario manipulado da "expired"', async () => {
    const c = await createCustomer();
    expect(await processCreatePet(petForm({ submission_token: 'x.y' }), c.id, { now })).toEqual({ status: 'expired' });
  });

  it('la lista va ordenada por nombre, sin distinguir mayúsculas', async () => {
    const c = await createCustomer();
    for (const name of ['zarpas', 'Bigotes', 'luna', 'Ágata']) await createPet(c.id, { name });
    expect((await listPets(c.id)).map((p) => p.name)).toEqual(['Ágata', 'Bigotes', 'luna', 'zarpas']);
  });
});
