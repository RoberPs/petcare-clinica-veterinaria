import type { Metadata } from 'next';
import Link from 'next/link';
import { loadOwnPet, requireOwnPet } from '@/lib/account/pet-view';
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

  return (
    <section className="panel" aria-labelledby="titulo-eliminar-mascota">
      <h2 id="titulo-eliminar-mascota">¿Eliminar a {pet.name}?</h2>
      <p>Se borrará su ficha de tu cuenta. No se puede deshacer.</p>
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
