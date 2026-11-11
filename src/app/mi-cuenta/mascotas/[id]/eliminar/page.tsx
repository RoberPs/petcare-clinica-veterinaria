import type { Metadata } from 'next';
import Link from 'next/link';
import { countUpcomingForPet } from '@/db/queries/appointments';
import { loadOwnPet, requireOwnPet } from '@/lib/account/pet-view';
import { getNow } from '@/lib/clock';
import { requireCustomer } from '@/lib/auth/require-customer';
import { deletePet } from '../../actions';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const customer = await requireCustomer();
  const pet = await loadOwnPet(customer.id, (await params).id);
  return { title: pet ? `Eliminar a ${pet.name}` : 'Mascota no encontrada' };
}

// Confirmación de borrado en una página propia (principio V). El botón es el neutro (.btn): no hay
// color de peligro; lo refuerzan el texto y la página aparte.
export default async function DeletePetPage({ params }: Props) {
  const customer = await requireCustomer();
  const pet = await requireOwnPet(customer.id, (await params).id);
  // Citas futuras que se cancelarán (feature 003, B12).
  const upcoming = await countUpcomingForPet(customer.id, pet.id, await getNow());

  return (
    <section className="panel" aria-labelledby="titulo-eliminar-mascota">
      <h2 id="titulo-eliminar-mascota">¿Eliminar a {pet.name}?</h2>
      <p>Se borrará su ficha de tu cuenta. No se puede deshacer.</p>
      {upcoming > 0 ? (
        <p className="closure-notice">
          <strong>
            {upcoming === 1
              ? 'Tiene 1 cita próxima que se cancelará'
              : `Tiene ${upcoming} citas próximas que se cancelarán`}
          </strong>{' '}
          y avisaremos a la clínica.
        </p>
      ) : null}
      <form action={deletePet.bind(null, pet.id)} className="band__actions">
        <button className="btn" type="submit">
          Eliminar a {pet.name}
        </button>
        <Link prefetch={false} className="btn btn--ghost" href="/mi-cuenta/mascotas">
          Cancelar
        </Link>
      </form>
    </section>
  );
}
