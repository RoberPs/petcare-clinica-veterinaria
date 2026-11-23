import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/Breadcrumb';
import { getSiteData } from '@/db/queries/site';

export const metadata: Metadata = {
  title: 'Mensaje enviado',
  description: 'Hemos recibido tu mensaje.',
  robots: { index: false },
};

// Confirmación tras el envío sin JavaScript (POST-Redirect-GET): recargar no reenvía nada.
export default async function ContactSentPage() {
  const { clinic } = await getSiteData();
  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <Breadcrumb current="Mensaje enviado" />
          <h1>Contacto</h1>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="form-success" role="status">
            <h2>Mensaje enviado</h2>
            <p>Gracias por escribirnos. Te responderemos {clinic.responseTimeText}.</p>
            <p>
              Te hemos enviado un correo de confirmación. Si es urgente, llámanos al{' '}
              <a className="link-underline" href={`tel:${clinic.phoneE164}`}>
                {clinic.phoneDisplay}
              </a>
              .
            </p>
            <Link prefetch={false} className="btn btn--ghost" href="/">
              Volver a la portada
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
