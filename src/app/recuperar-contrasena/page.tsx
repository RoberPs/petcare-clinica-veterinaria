import type { Metadata } from 'next';
import Link from 'next/link';
import { EmailActionForm } from '@/components/EmailActionForm';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { requestReset } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Recuperar la contraseña',
  description: 'Pide un enlace para crear una contraseña nueva.',
};

// Recuperar la contraseña (US5).
export default function ForgotPasswordPage() {
  return (
    <div className="auth">
      <section className="auth__card" aria-labelledby="titulo-recuperar">
        <h1 id="titulo-recuperar">Recuperar la contraseña</h1>
        <p>Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
        <EmailActionForm action={requestReset} buttonLabel="Enviar el enlace" reloadHref="/recuperar-contrasena" />
        <p className="auth__alt">
          ¿Te has acordado?{' '}
          <Link prefetch={false} href="/iniciar-sesion">
            Iniciar sesión
          </Link>
        </p>
      </section>
    </div>
  );
}
