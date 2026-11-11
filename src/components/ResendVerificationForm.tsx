'use client';

import { resendVerification } from '@/app/crear-cuenta/actions';
import { EmailActionForm } from './EmailActionForm';

// Reenvío del enlace de verificación. La respuesta es la misma exista o no la cuenta.
export function ResendVerificationForm({ email }: { email?: string }) {
  return (
    <EmailActionForm
      action={resendVerification}
      buttonLabel="Enviar otro enlace"
      buttonClass="btn btn--ghost"
      reloadHref="/crear-cuenta/revisa-tu-correo"
      email={email}
    />
  );
}
