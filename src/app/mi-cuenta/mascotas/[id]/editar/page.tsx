import type { Metadata } from 'next';
import { PetForm } from '@/components/PetForm';
import { listSpecies } from '@/db/queries/species';
import { loadOwnPet, requireOwnPet, todayIso } from '@/lib/account/pet-view';
import { requireCustomer } from '@/lib/auth/require-customer';
import { updatePet } from '../../actions';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const customer = await requireCustomer();
  const pet = await loadOwnPet(customer.id, (await params).id);
  return { title: pet ? `Editar a ${pet.name}` : 'Mascota no encontrada' };
}

// Edición de una mascota (US3). Si no existe o no es del cliente, 404 (A9).
export default async function EditPetPage({ params }: Props) {
  const customer = await requireCustomer();
  const { id } = await params;
  const pet = await requireOwnPet(customer.id, id);
  const [species, today] = await Promise.all([listSpecies(), todayIso()]);

  return (
    <PetForm
      action={updatePet.bind(null, pet.id)}
      species={species}
      today={today}
      initial={{ name: pet.name, species: pet.speciesKey ?? 'other', birthDate: pet.birthDate }}
      submitLabel="Guardar cambios"
    />
  );
}
