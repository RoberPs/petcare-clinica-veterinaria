import type { Metadata } from 'next';
import Link from 'next/link';
import { PetCard } from '@/components/PetCard';
import { sectionHref } from '@/domain/sections';
import { listPets } from '@/db/queries/pets';
import { getSiteData } from '@/db/queries/site';
import { withAges } from '@/lib/account/pet-view';
import { requireCustomer } from '@/lib/auth/require-customer';

export const metadata: Metadata = { title: 'Mi cuenta' };

// Resumen del área personal (US4, design/cuenta.html). El saludo está en la banda del layout. No se
// pinta el bloque "Últimos pedidos": la tienda es una feature posterior.
export default async function AccountSummaryPage() {
  const customer = await requireCustomer();
  const [pets, { sections }] = await Promise.all([listPets(customer.id), getSiteData()]);
  const appointmentHref = sectionHref('reservas', sections);

  return (
    <>
      <h2>Mis mascotas</h2>
      {pets.length === 0 ? (
        <div className="empty-state">
          <p>Aún no has añadido ninguna mascota. Añádelas para tener su ficha a mano cuando pidas cita.</p>
          <Link prefetch={false} className="btn" href="/mi-cuenta/mascotas/nueva">
            Añadir mascota
          </Link>
        </div>
      ) : (
        <ul className="pets">
          {(await withAges(pets)).map((pet) => (
            <PetCard key={pet.id} pet={pet} age={pet.age} appointmentHref={appointmentHref} />
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
      )}
    </>
  );
}
