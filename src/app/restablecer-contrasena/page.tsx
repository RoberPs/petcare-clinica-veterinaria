import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { peekToken } from '@/lib/auth/tokens';
import { getNow } from '@/lib/clock';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Crear una contraseña nueva',
  description: 'Crea una contraseña nueva para tu cuenta.',
};

type Props = { searchParams: Promise<{ token?: string | string[] }> };

// Página del enlace de recuperación (A4): el GET solo comprueba el token; se gasta al enviar.
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token: raw } = await searchParams;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const peek = token ? await peekToken(token, 'reset_password', await getNow()) : null;

  if (token && peek?.status === 'valid') {
    return (
      <div className="auth">
        <section className="auth__card" aria-labelledby="titulo-restablecer">
          <h1 id="titulo-restablecer">Crea una contraseña nueva</h1>
          <p>Al guardarla se cerrará la sesión en todos tus dispositivos.</p>
          <ResetPasswordForm token={token} />
        </section>
      </div>
    );
  }

  return (
    <div className="auth">
      <section className="auth__card" aria-labelledby="titulo-restablecer">
        <h1 id="titulo-restablecer">El enlace ha caducado</h1>
        <p>
          Este enlace ya no es válido: puede que haya caducado (duran 1 hora), que ya lo hayas usado o que hayas
          pedido otro después.
        </p>
        <Link prefetch={false} className="btn btn--block" href="/recuperar-contrasena">
          Pedir otro enlace
        </Link>
      </section>
    </div>
  );
}
