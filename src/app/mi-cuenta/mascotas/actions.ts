'use server';

import { redirect } from 'next/navigation';
import { actionContext } from '@/lib/account/action-context';
import type { PetFormState } from '@/lib/account/form-state';
import { PET_NOT_FOUND_PATH } from '@/lib/account/pet-view';
import { processCreatePet, processDeletePet, processUpdatePet } from '@/lib/account/pets';
import { requireCustomer } from '@/lib/auth/require-customer';

// Server Actions de las mascotas. Cada una vuelve a comprobar la sesión (A3): el layout no se
// ejecuta al invocar una acción. El id de la mascota va ligado con bind() desde la página.

const LIST = '/mi-cuenta/mascotas';

export async function createPet(_prev: PetFormState, form: FormData): Promise<PetFormState> {
  const customer = await requireCustomer();
  const { now } = await actionContext();
  const result = await processCreatePet(form, customer.id, { now });
  if (result.status === 'ok') redirect(`${LIST}?aviso=mascota-anadida`);
  return result;
}

export async function updatePet(petId: string, _prev: PetFormState, form: FormData): Promise<PetFormState> {
  const customer = await requireCustomer();
  const { now } = await actionContext();
  const result = await processUpdatePet(form, customer.id, petId, { now });
  if (result.status === 'ok') redirect(`${LIST}?aviso=mascota-guardada`);
  // Ajena o inexistente: 404 (A9).
  if (result.status === 'not_found') redirect(PET_NOT_FOUND_PATH);
  return result;
}

export async function deletePet(petId: string): Promise<void> {
  const customer = await requireCustomer();
  const result = await processDeletePet(customer.id, petId);
  if (result.status === 'ok') redirect(`${LIST}?aviso=mascota-eliminada`);
  redirect(result.status === 'not_found' ? PET_NOT_FOUND_PATH : `${LIST}/${encodeURIComponent(petId)}/eliminar`);
}
