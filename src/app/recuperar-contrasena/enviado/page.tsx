import type { Metadata } from 'next';
import Link from 'next/link';
import { privateMetadata } from '@/lib/auth/private-metadata';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Revisa tu correo',
  description: 'Si el correo tiene una cuenta, te hemos enviado un enlace.',
};

// Mensaje neutro (FR-018): no dice si el correo tiene cuenta.
export default function ResetSentPage() {
  return (
    <div className="auth">
      <section className="auth__card" aria-labelledby="titulo-enviado">
        <h1 id="titulo-enviado">Revisa tu correo</h1>
        <p>
          Si ese correo tiene una cuenta, te hemos enviado un enlace para crear una contraseña nueva. Caduca en 1
          hora.
        </p>
        <p>Si no lo ves en unos minutos, mira en la carpeta de correo no deseado.</p>
        <p className="auth__alt">
          <Link prefetch={false} href="/iniciar-sesion">
            Volver a iniciar sesión
          </Link>
        </p>
      </section>
    </div>
  );
}
