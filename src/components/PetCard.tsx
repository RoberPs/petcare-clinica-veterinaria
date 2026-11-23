import Link from 'next/link';
import type { Pet } from '@/db/queries/pets';
import { PetIcon } from './PetIcon';

interface Props {
  pet: Pick<Pet, 'id' | 'name' | 'speciesKey' | 'speciesLabel'>;
  /** Edad ya calculada con petAge() ("4 años", "5 meses"…). */
  age: string;
  /** Destino de "Pedir cita": petAppointmentHref() (la reserva con la mascota preelegida). */
  appointmentHref: string;
  /** En la lista de mascotas se muestran "Editar" y "Eliminar"; en el resumen, no. */
  manage?: boolean;
}

// Tarjeta de una mascota (design/cuenta.html: pet, pet__avatar y product__meta).
export function PetCard({ pet, age, appointmentHref, manage = false }: Props) {
  const species = pet.speciesLabel ?? 'Otra';
  return (
    <li className="pet">
      <div className="pet__avatar">
        <PetIcon speciesKey={pet.speciesKey} />
      </div>
      <h3>{pet.name}</h3>
      <span className="product__meta">
        {species} · {age}
      </span>
      <div className="pet__actions">
        <Link prefetch={false} className="btn btn--sky btn--sm" href={appointmentHref}>
          Pedir cita<span className="visually-hidden"> para {pet.name}</span>
        </Link>
        {manage ? (
          <>
            <Link
              prefetch={false}
              className="btn btn--ghost btn--sm"
              href={`/mi-cuenta/mascotas/${pet.id}/editar`}
            >
              Editar<span className="visually-hidden"> a {pet.name}</span>
            </Link>
            <Link
              prefetch={false}
              className="btn btn--ghost btn--sm"
              href={`/mi-cuenta/mascotas/${pet.id}/eliminar`}
            >
              Eliminar<span className="visually-hidden"> a {pet.name}</span>
            </Link>
          </>
        ) : null}
      </div>
    </li>
  );
}
