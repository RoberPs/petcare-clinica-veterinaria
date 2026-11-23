import Link from 'next/link';
import { Breadcrumb } from './Breadcrumb';

// Ficha inexistente o no visible (contracts/routes.md): 404 con enlace al catálogo. Lo pinta el 404
// raíz (vía el middleware, también sin JavaScript) y el not-found de la ficha.
export function ProductNotFound() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <Breadcrumb current="Producto no encontrado" trail={[{ href: '/productos', label: 'Nuestros productos' }]} />
          <h1>No hemos encontrado este producto</h1>
          <p className="preamble">Puede que ya no esté en el catálogo o que la dirección esté mal escrita.</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="cta-box">
            <h2>Sigue buscando</h2>
            <div className="band__actions">
              <Link prefetch={false} className="btn" href="/productos">
                Ver todo el catálogo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
