import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/Notice';
import { ResendVerificationForm } from '@/components/ResendVerificationForm';
import { privateMetadata } from '@/lib/auth/private-metadata';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Revisa tu correo',
  description: 'Te hemos enviado un enlace para confirmar tu correo.',
};

type Props = { searchParams: Promise<{ aviso?: string | string[] }> };

// "Revisa tu correo" (US1). El texto es el mismo exista o no la cuenta (A5).
export default async function CheckEmailPage({ searchParams }: Props) {
  const { aviso } = await searchParams;
  return (
    <div className="auth">
      <section className="auth__card" aria-labelledby="titulo-revisa">
        <h1 id="titulo-revisa">Revisa tu correo</h1>
        <Notice code={aviso} />
        <p>
          Te hemos enviado un correo con un enlace para confirmar tu dirección. Ábrelo en las próximas 24 horas
          para activar tu cuenta.
        </p>
        <p>Si no lo ves en unos minutos, mira en la carpeta de correo no deseado o pide otro enlace:</p>
        <ResendVerificationForm />
        <p className="auth__alt">
          ¿Ya lo has confirmado?{' '}
          <Link prefetch={false} href="/iniciar-sesion">
            Iniciar sesión
          </Link>
        </p>
      </section>
    </div>
  );
}
