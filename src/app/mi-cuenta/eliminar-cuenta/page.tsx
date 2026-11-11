import type { Metadata } from 'next';
import { DeleteAccountForm } from '@/components/DeleteAccountForm';
import { requireCustomer } from '@/lib/auth/require-customer';

export const metadata: Metadata = { title: 'Eliminar mi cuenta' };

// Eliminar la cuenta (US7, A12): explica qué se borra y pide la contraseña.
export default async function DeleteAccountPage() {
  await requireCustomer();
  return (
    <section className="panel" aria-labelledby="titulo-eliminar-cuenta">
      <h2 id="titulo-eliminar-cuenta">¿Seguro que quieres eliminar tu cuenta?</h2>
      <p>Se borrarán en el acto y para siempre:</p>
      <ul>
        <li>tus datos personales (nombre, correo, teléfono y dirección);</li>
        <li>todas tus mascotas;</li>
        <li>tus preferencias y la sesión en todos tus dispositivos.</li>
      </ul>
      <p>
        <strong>No se puede deshacer.</strong> Si quieres conservar una copia, descarga antes tus datos desde
        &quot;Datos personales&quot;. Te enviaremos un correo para confirmar el borrado.
      </p>
      <DeleteAccountForm />
    </section>
  );
}
