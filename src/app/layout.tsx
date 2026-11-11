import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import '../../design/tokens.css';
import '../../design/styles.css';
import { CookieBanner } from '@/components/CookieBanner';
import { DemoBanner } from '@/components/DemoBanner';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getSiteData } from '@/db/queries/site';
import { getConsent } from '@/lib/consent';
import { getPathname } from '@/lib/request';

// Todo se renderiza en cada petición: lo exige la CSP con nonce (R1) y hace exacto "Abierto ahora".
export const dynamic = 'force-dynamic';

// Figtree autoalojada: los archivos se sirven desde el propio dominio (sin terceros, principio IV).
// `optional`: si la fuente no llega a tiempo se queda la de respaldo y no se cambia después, así
// no hay salto de diseño (CLS) en redes lentas ni en sistemas sin Arial, como Android o Linux.
const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'optional' });

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const { clinic } = await getSiteData();
  return {
    metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
    title: { template: `%s · ${clinic.name}`, default: clinic.name },
    description: clinic.heroText,
    openGraph: { siteName: clinic.name, locale: 'es_ES', type: 'website' },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await getSiteData();
  // El aviso de cookies sale mientras no haya una elección vigente (FR-035 y FR-037).
  const showCookieBanner = getConsent(await cookies()) === null;
  return (
    <html lang="es" className={figtree.variable}>
      <body className={showCookieBanner ? 'has-cookie-banner' : undefined}>
        <a className="skip-link" href="#contenido">
          Saltar al contenido
        </a>
        <DemoBanner enabled={site.clinic.demoBannerEnabled} clinicName={site.clinic.name} />
        <SiteHeader site={site} />
        <main id="contenido" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter site={site} />
        {showCookieBanner ? <CookieBanner returnTo={await getPathname()} /> : null}
      </body>
    </html>
  );
}
