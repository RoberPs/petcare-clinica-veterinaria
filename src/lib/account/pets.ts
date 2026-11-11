import { petSchema, validateForm } from '@/domain/account-schemas';
import { todayInClinicZone } from '@/domain/pet-age';
import { getDb } from '@/db/client';
import { lockCustomer } from '@/db/queries/customers';
import { countPets, deletePet, getPet, insertPet, updatePet, type Pet } from '@/db/queries/pets';
import { listSpecies } from '@/db/queries/species';
import { claimSubmission } from '@/lib/auth/submission';
import { verifySubmissionToken } from '@/lib/form-token';
import { logger } from '@/lib/logger';
import type { PetFormState } from './form-state';
import { errorCode, formRecord } from './common';

// Gestión de mascotas (US3, A9). El customerId llega SIEMPRE de requireCustomer(), nunca del
// formulario. Una mascota ajena se trata exactamente igual que una que no existe.

export const MAX_PETS = 30;

function denied(customerId: string, petId: string, action: string): void {
  logger.warn({ customer_id: customerId, pet_id: petId.slice(0, 64), code: action }, 'pet_access_denied');
}

/** Mascota del cliente para las páginas de editar y eliminar; si no es suya, null (y queda registrado). */
export async function readOwnPet(customerId: string, petId: string): Promise<Pet | null> {
  const pet = await getPet(customerId, petId);
  if (!pet) denied(customerId, petId, 'read');
  return pet;
}

async function validatePet(form: FormData, now: Date) {
  const keys = (await listSpecies()).map((s) => s.key);
  return validateForm(petSchema(keys, todayInClinicZone(now).toString()), formRecord(form));
}

export async function processCreatePet(form: FormData, customerId: string, ctx: { now: Date }): Promise<PetFormState> {
  // Idempotencia (A5). El usuario ya está identificado: no se exige el tiempo mínimo anti-robots.
  const token = verifySubmissionToken(form.get('submission_token'), ctx.now, { minAgeMs: 0 });
  if (!token.ok) return { status: 'expired' };

  const validation = await validatePet(form, ctx.now);
  if (!validation.ok) return { status: 'invalid', ...validation };
  const data = validation.data;

  try {
    return await getDb().transaction(async (tx): Promise<PetFormState> => {
      // FOR UPDATE sobre el cliente: dos altas a la vez no pueden pasar del límite (A9).
      if (!(await lockCustomer(customerId, tx))) return { status: 'not_found' };
      const claim = await claimSubmission(tx, token.submissionId, 'pet_create');
      if (claim.status === 'duplicate') return { status: 'ok' };
      if ((await countPets(customerId, tx)) >= MAX_PETS) {
        // Se deshace también el registro del envío: si el cliente borra una mascota, puede reintentarlo.
        throw new PetLimitReached();
      }
      const petId = await insertPet(customerId, { name: data.name, speciesKey: data.species, birthDate: data.birth_date }, ctx.now, tx);
      logger.info({ customer_id: customerId, pet_id: petId }, 'pet_created');
      return { status: 'ok' };
    });
  } catch (error) {
    if (error instanceof PetLimitReached) return { status: 'limit_reached' };
    logger.error({ customer_id: customerId, code: errorCode(error) }, 'pet_create_failed');
    return { status: 'error' };
  }
}

class PetLimitReached extends Error {
  constructor() {
    super('pet_limit_reached');
  }
}

export async function processUpdatePet(form: FormData, customerId: string, petId: string, ctx: { now: Date }): Promise<PetFormState> {
  // Antes de validar: a quien no es el dueño no se le da ninguna pista (ni errores de campo).
  if (!(await getPet(customerId, petId))) {
    denied(customerId, petId, 'update');
    return { status: 'not_found' };
  }
  const validation = await validatePet(form, ctx.now);
  if (!validation.ok) return { status: 'invalid', ...validation };
  const data = validation.data;
  try {
    const updated = await updatePet(customerId, petId, { name: data.name, speciesKey: data.species, birthDate: data.birth_date });
    if (!updated) {
      denied(customerId, petId, 'update');
      return { status: 'not_found' };
    }
    logger.info({ customer_id: customerId, pet_id: petId }, 'pet_updated');
    return { status: 'ok' };
  } catch (error) {
    logger.error({ customer_id: customerId, code: errorCode(error) }, 'pet_update_failed');
    return { status: 'error' };
  }
}

export async function processDeletePet(customerId: string, petId: string): Promise<PetFormState> {
  try {
    if (!(await deletePet(customerId, petId))) {
      denied(customerId, petId, 'delete');
      return { status: 'not_found' };
    }
    logger.info({ customer_id: customerId, pet_id: petId }, 'pet_deleted');
    return { status: 'ok' };
  } catch (error) {
    logger.error({ customer_id: customerId, code: errorCode(error) }, 'pet_delete_failed');
    return { status: 'error' };
  }
}
