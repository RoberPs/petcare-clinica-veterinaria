import type { Metadata } from 'next';
import Link from 'next/link';
import { NextAppointment } from '@/components/NextAppointment';
import { PetCard } from '@/components/PetCard';
import { isSectionEnabled, petAppointmentHref, sectionHref } from '@/domain/sections';
import { nextCustomerAppointment } from '@/db/queries/appointments';
import { listPets } from '@/db/queries/pets';
import { getNow } from '@/lib/clock';
import { getSiteData } from '@/db/queries/site';
import { withAges } from '@/lib/account/pet-view';
import { requireCustomer } from '@/lib/auth/require-customer';

export const metadata: Metadata = { title: 'Mi cuenta' };

// Resumen del área personal (US4, design/cuenta.html). El saludo está en la banda del layout. No se
// pinta el bloque "Últimos pedidos": la tienda es una feature posterior.
export default async function AccountSummaryPage() {
  const customer = await requireCustomer();
  const [pets, { sections }, now] = await Promise.all([listPets(customer.id), getSiteData(), getNow()]);
  // "Tu próxima cita" (FR-021), solo si la reserva está activa.
  const bookingOn = isSectionEnabled('reservas', sections);
  const next = bookingOn ? await nextCustomerAppointment(customer.id, now) : null;

  return (
    <>
      {bookingOn ? <NextAppointment appointment={next} bookHref={sectionHref('reservas', sections)} /> : null}
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
            <PetCard
              key={pet.id}
              pet={pet}
              age={pet.age}
              appointmentHref={petAppointmentHref(sections, pet.id)}
            />
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
