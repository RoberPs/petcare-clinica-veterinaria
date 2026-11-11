import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/Notice';
import { PetCard } from '@/components/PetCard';
import { sectionHref } from '@/domain/sections';
import { listPets } from '@/db/queries/pets';
import { getSiteData } from '@/db/queries/site';
import { withAges } from '@/lib/account/pet-view';
import { requireCustomer } from '@/lib/auth/require-customer';

export const metadata: Metadata = { title: 'Mis mascotas' };

type Props = { searchParams: Promise<{ aviso?: string | string[] }> };

// Lista de mascotas (US3): ordenadas por nombre, o el estado vacío.
export default async function PetsPage({ searchParams }: Props) {
  const customer = await requireCustomer();
  const [{ aviso }, pets, { sections }] = await Promise.all([searchParams, listPets(customer.id), getSiteData()]);
  const appointmentHref = sectionHref('reservas', sections);

  return (
    <>
      <Notice code={aviso} />
      {pets.length === 0 ? (
        <div className="empty-state">
          <h2>Aún no has añadido ninguna mascota</h2>
          <p>Añade a tus mascotas para tener su ficha a mano cuando pidas cita.</p>
          <Link prefetch={false} className="btn" href="/mi-cuenta/mascotas/nueva">
            Añadir mascota
          </Link>
        </div>
      ) : (
        <>
          <h2>Tus mascotas</h2>
          <ul className="pets">
            {(await withAges(pets)).map((pet) => (
              <PetCard key={pet.id} pet={pet} age={pet.age} appointmentHref={appointmentHref} manage />
            ))}
            <li className="pet pet--add">
              <Link prefetch={false} href="/mi-cuenta/mascotas/nueva" className="pet--add__link">
                <span className="pet--add__plus" aria-hidden="true">
                  +
                </span>
                <strong>Añadir mascota</strong>
              </Link>
            </li>
          </ul>
        </>
      )}
    </>
  );
}
