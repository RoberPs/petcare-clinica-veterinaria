import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { Notice } from '@/components/Notice';
import { safeReturnTo } from '@/lib/account/login';
import { readLoginHint } from '@/lib/auth/login-hint';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { getOptionalCustomer } from '@/lib/auth/require-customer';
import { getNow } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Iniciar sesión',
  description: 'Entra en tu cuenta para ver tus mascotas y tus datos.',
};

type Props = { searchParams: Promise<{ aviso?: string | string[]; return_to?: string | string[] }> };

// Iniciar sesión (US2). Con una sesión vigente no se muestra: se va al destino.
export default async function LoginPage({ searchParams }: Props) {
  const { aviso, return_to } = await searchParams;
  const returnTo = Array.isArray(return_to) ? return_to[0] : return_to;
  if (await getOptionalCustomer()) redirect(safeReturnTo(returnTo));
  const hint = await readLoginHint(await getNow());

  return (
    <div className="auth">
      <section className="auth__card" aria-labelledby="titulo-acceso">
        <h1 id="titulo-acceso">Iniciar sesión</h1>
        <Notice code={aviso} />
        <p>Entra para ver tus mascotas y tener tus datos a mano.</p>
        <LoginForm defaultEmail={hint ?? undefined} returnTo={returnTo && safeReturnTo(returnTo) !== '/mi-cuenta' ? returnTo : undefined} />
        <p className="auth__alt">
          ¿Aún no tienes cuenta?{' '}
          <Link prefetch={false} href="/crear-cuenta">
            Crear cuenta
          </Link>
        </p>
      </section>
    </div>
  );
}
