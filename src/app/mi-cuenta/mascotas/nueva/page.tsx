import type { Metadata } from 'next';
import Link from 'next/link';
import { PetForm } from '@/components/PetForm';
import { countPets } from '@/db/queries/pets';
import { listSpecies } from '@/db/queries/species';
import { MAX_PETS } from '@/lib/account/pets';
import { todayIso } from '@/lib/account/pet-view';
import { requireCustomer } from '@/lib/auth/require-customer';
import { createSubmissionToken } from '@/lib/form-token';
import { createPet } from '../actions';

export const metadata: Metadata = { title: 'Añadir mascota' };

// Alta de una mascota (US3). Con 30 mascotas solo se muestra el aviso del límite.
export default async function NewPetPage() {
  const customer = await requireCustomer();
  const [count, species, today] = await Promise.all([countPets(customer.id), listSpecies(), todayIso()]);

  if (count >= MAX_PETS) {
    return (
      <div className="empty-state">
        <h2>Has llegado al máximo de mascotas</h2>
        <p>Cada cuenta puede tener hasta {MAX_PETS} mascotas. Elimina alguna para añadir otra.</p>
        <Link prefetch={false} className="btn" href="/mi-cuenta/mascotas">
          Volver a mis mascotas
        </Link>
      </div>
    );
  }

  return (
    <PetForm
      action={createPet}
      species={species}
      today={today}
      submissionToken={createSubmissionToken()}
      submitLabel="Añadir mascota"
    />
  );
}
