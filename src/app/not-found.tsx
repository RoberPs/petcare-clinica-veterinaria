import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ProductNotFound } from '@/components/ProductNotFound';
import { isSectionEnabled } from '@/domain/sections';
import { getSiteData } from '@/db/queries/site';

export const metadata: Metadata = {
  title: 'Página no encontrada',
  description: 'La página que buscas no existe o ha cambiado de dirección.',
  robots: { index: false },
};

// No encontrada (404): mantiene la cabecera y el pie del layout. Una ficha de producto que no existe
// llega aquí reescrita por el middleware y, con la tienda activa, muestra su propio mensaje.
export default async function NotFound() {
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (pathname.startsWith('/productos/')) {
    const { sections } = await getSiteData().catch(() => ({ sections: [] }));
    if (isSectionEnabled('tienda', sections)) return <ProductNotFound />;
  }
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <h1>No encontramos esta página</h1>
          <p className="preamble">Puede que la dirección esté mal escrita o que la página haya cambiado de sitio.</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="cta-box">
            <h2>¿Adónde quieres ir?</h2>
            <div className="band__actions">
              <Link prefetch={false} className="btn" href="/">
                Ir a la portada
              </Link>
              <Link prefetch={false} className="btn btn--pink" href="/contacto">
                Contacto
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
