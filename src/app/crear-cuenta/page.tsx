import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/RegisterForm';
import { getOptionalCustomer } from '@/lib/auth/require-customer';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { createSubmissionToken } from '@/lib/form-token';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Crear cuenta',
  description: 'Crea tu cuenta para guardar los datos de tus mascotas.',
};

// Registro (US1). Si ya hay sesión, no tiene sentido: se va al área personal.
export default async function RegisterPage() {
  if (await getOptionalCustomer()) redirect('/mi-cuenta');

  return (
    <div className="auth">
      <section className="auth__card auth__card--wide" aria-labelledby="titulo-registro">
        <h1 id="titulo-registro">Crear cuenta</h1>
        <p>Guarda los datos de tus mascotas y tenlos a mano cada vez que vengas a la clínica.</p>
        {/* Token nuevo en cada petición: idempotencia del envío y tiempo mínimo (A5). */}
        <RegisterForm token={createSubmissionToken()} />
        <p className="auth__alt">
          ¿Ya tienes cuenta?{' '}
          <Link prefetch={false} href="/iniciar-sesion">
            Iniciar sesión
          </Link>
        </p>
      </section>
    </div>
  );
}
