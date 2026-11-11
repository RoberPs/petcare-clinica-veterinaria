import type { Metadata } from 'next';
import Link from 'next/link';
import { sectionHref } from '@/domain/sections';
import { getPublishedServices } from '@/db/queries/services';
import { getSiteData } from '@/db/queries/site';

export async function generateMetadata(): Promise<Metadata> {
  const { clinic } = await getSiteData();
  return {
    title: 'Tratamientos y servicios',
    description: `Servicios veterinarios de ${clinic.name}: consulta, prevención, cirugía y más, explicados con claridad.`,
    alternates: { canonical: '/tratamientos' },
  };
}

// Tratamientos (US3): lista de servicios publicados o un estado vacío, y CTA finales (FR-013 a FR-015).
export default async function ServicesPage() {
  const [site, services] = await Promise.all([getSiteData(), getPublishedServices()]);

  return (
    <>
      <section className="photo-hero">
        <div className="photo-hero__card">
          <h1>Tratamientos y servicios</h1>
          <p className="preamble">Lo que podemos hacer por tu mascota, explicado sin tecnicismos.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="lista-servicios">
        <div className="container">
          <h2 id="lista-servicios">Nuestros servicios</h2>
          {services.length > 0 ? (
            <ul className="service-list">
              {services.map((s) => (
                <li className="service" key={s.slug}>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <p>Estamos actualizando la lista de servicios. Cuéntanos qué necesita tu mascota y te orientamos.</p>
              <Link prefetch={false} className="btn btn--pink" href="/contacto">
                Contacto
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="band">
        <div className="container band__row">
          <h2>¿Necesitas alguno de estos servicios?</h2>
          <div className="band__actions">
            <Link prefetch={false} className="btn btn--sky" href={sectionHref('reservas', site.sections)}>
              Pide cita
            </Link>
            <Link prefetch={false} className="btn btn--pink" href="/contacto">
              Contacto
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
