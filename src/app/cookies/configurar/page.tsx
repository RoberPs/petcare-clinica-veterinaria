import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ConsentForm } from '@/components/ConsentForm';
import { formatDateTime } from '@/domain/time';
import { getConsent } from '@/lib/consent';

export const metadata: Metadata = {
  title: 'Configurar cookies',
  description: 'Revisa, cambia o retira tu consentimiento para el contenido de terceros.',
  robots: { index: false },
};

// Configurar cookies (FR-038): estado actual, explicación de la categoría y el mismo formulario.
export default async function CookieSettingsPage() {
  const consent = getConsent(await cookies());
  const state = !consent
    ? 'Todavía no has elegido. Mientras tanto no se carga ningún contenido de terceros.'
    : consent.third_party
      ? `Has aceptado el contenido de terceros (${formatDateTime(new Date(consent.at))}).`
      : `Has rechazado el contenido de terceros (${formatDateTime(new Date(consent.at))}).`;

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <Breadcrumb current="Configurar cookies" />
          <h1>Configurar cookies</h1>
        </div>
      </section>
      <section className="section">
        <div className="container prose cookie-settings">
          <p role="status">
            <strong>Estado actual:</strong> {state}
          </p>
          <h2>Contenido de terceros: mapa</h2>
          <p>
            El mapa de las páginas La clínica y Contacto se carga desde OpenStreetMap, que puede guardar datos en tu
            navegador. Si lo rechazas, verás la dirección y un enlace para abrirla en el mapa.
          </p>
          <ConsentForm returnTo="/cookies/configurar">
            <button className="btn" type="submit" name="choice" value="accept">
              Aceptar
            </button>
            <button className="btn" type="submit" name="choice" value="reject">
              Rechazar
            </button>
          </ConsentForm>
          <p>
            Más información en la <Link prefetch={false} href="/politica-de-cookies">política de cookies</Link>.{' '}
            <Link prefetch={false} href="/">Volver a la portada</Link>
          </p>
        </div>
      </section>
    </>
  );
}
