import type { Metadata } from 'next';
import Link from 'next/link';
import { ResendVerificationForm } from '@/components/ResendVerificationForm';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { getNow } from '@/lib/clock';
import { peekToken } from '@/lib/auth/tokens';
import { verifyEmail } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Confirmar el correo',
  description: 'Confirma tu correo para activar tu cuenta.',
};

type Props = { searchParams: Promise<{ token?: string | string[] }> };

// Página del enlace de verificación (A4). El GET solo comprueba el token: los escáneres de enlaces de
// los correos no lo gastan. Se gasta con el botón "Confirmar mi correo" (POST).
export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token: raw } = await searchParams;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const peek = token ? await peekToken(token, 'verify_email', await getNow()) : ({ status: 'invalid' } as const);

  if (peek.status === 'valid') {
    return (
      <div className="auth">
        <section className="auth__card" aria-labelledby="titulo-verificar">
          <h1 id="titulo-verificar">Confirma tu correo</h1>
          <p>Pulsa el botón para confirmar que este correo es tuyo y activar tu cuenta.</p>
          <form className="form" action={verifyEmail}>
            <input type="hidden" name="token" value={token} />
            <button className="btn btn--block" type="submit">
              Confirmar mi correo
            </button>
          </form>
        </section>
      </div>
    );
  }

  if (peek.status === 'used' && peek.emailVerified) {
    return (
      <div className="auth">
        <section className="auth__card" aria-labelledby="titulo-verificar">
          <h1 id="titulo-verificar">Tu correo ya está verificado</h1>
          <p>Ya puedes entrar en tu cuenta.</p>
          <Link prefetch={false} className="btn btn--block" href="/iniciar-sesion">
            Iniciar sesión
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="auth">
      <section className="auth__card" aria-labelledby="titulo-verificar">
        <h1 id="titulo-verificar">El enlace ha caducado</h1>
        <p>
          Este enlace ya no es válido: puede que haya caducado (duran 24 horas), que ya lo hayas usado o que
          hayas pedido otro después. Escribe tu correo y te enviaremos uno nuevo.
        </p>
        <ResendVerificationForm />
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
