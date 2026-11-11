import type { Metadata } from 'next';
import { DeleteAccountForm } from '@/components/DeleteAccountForm';
import { upcomingIds } from '@/db/queries/appointments';
import { getDb } from '@/db/client';
import { requireCustomer } from '@/lib/auth/require-customer';
import { getNow } from '@/lib/clock';

export const metadata: Metadata = { title: 'Eliminar mi cuenta' };

// Eliminar la cuenta (US7, A12): explica qué se borra y pide la contraseña.
export default async function DeleteAccountPage() {
  const customer = await requireCustomer();
  // Citas futuras que se cancelarán (feature 003, B12).
  const upcoming = (await upcomingIds(getDb(), customer.id, await getNow())).length;
  return (
    <section className="panel" aria-labelledby="titulo-eliminar-cuenta">
      <h2 id="titulo-eliminar-cuenta">¿Seguro que quieres eliminar tu cuenta?</h2>
      <p>Se borrarán en el acto y para siempre:</p>
      <ul>
        <li>tus datos personales (nombre, correo, teléfono y dirección);</li>
        <li>todas tus mascotas;</li>
        <li>tus preferencias y la sesión en todos tus dispositivos.</li>
        <li>tus datos de contacto en las citas: las anteriores se quedan sin ellos.</li>
      </ul>
      {upcoming > 0 ? (
        <p className="closure-notice">
          <strong>
            {upcoming === 1
              ? 'Tienes 1 cita próxima que se cancelará'
              : `Tienes ${upcoming} citas próximas que se cancelarán`}
          </strong>{' '}
          y la hora quedará libre. Avisaremos a la clínica.
        </p>
      ) : null}
      <p>
        <strong>No se puede deshacer.</strong> Si quieres conservar una copia, descarga antes tus datos desde
        &quot;Datos personales&quot;. Te enviaremos un correo para confirmar el borrado.
      </p>
      <DeleteAccountForm />
    </section>
  );
}
