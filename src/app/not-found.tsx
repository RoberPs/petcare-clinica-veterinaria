import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Página no encontrada',
  description: 'La página que buscas no existe o ha cambiado de dirección.',
  robots: { index: false },
};

// No encontrada (404): mantiene la cabecera y el pie del layout.
export default function NotFound() {
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
