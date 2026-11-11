import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { sectionHref } from '@/domain/sections';
import { getHomeData } from '@/db/queries/home';
import { getSiteData } from '@/db/queries/site';

export async function generateMetadata(): Promise<Metadata> {
  const { clinic } = await getSiteData();
  return {
    title: { absolute: `${clinic.name} · Clínica veterinaria` },
    description: clinic.heroText,
    alternates: { canonical: '/' },
  };
}

// Portada (US1): propuesta, tres CTA, tres accesos rápidos, cifras y avisos con fuente. Sin boletín.
export default async function HomePage() {
  const { site, stats, notices } = await getHomeData();
  const { clinic, sections } = site;

  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero__card">
            <h1>{clinic.heroTitle}</h1>
            <p className="preamble">{clinic.heroText}</p>
            <div className="hero__actions">
              <Link prefetch={false} className="btn btn--sky" href={sectionHref('reservas', sections)}>
                <Icon name="cita" />
                Pide cita online
              </Link>
              <Link prefetch={false} className="btn btn--pink" href="/contacto">
                <Icon name="telefono" />
                Contacto
              </Link>
            </div>
            <Link prefetch={false} className="btn btn--ghost hero__ghost" href="/la-clinica">
              Conoce la clínica
            </Link>
          </div>
          {clinic.heroImagePath ? (
            <div className="hero__media">
              <Image
                src={clinic.heroImagePath}
                alt={clinic.heroImageAlt ?? ''}
                width={1200}
                height={900}
                priority
                sizes="(max-width: 900px) 100vw, 50vw"
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="band" aria-labelledby="accesos-rapidos">
        <h2 id="accesos-rapidos" className="visually-hidden">
          Accesos rápidos
        </h2>
        <div className="container cards">
          <Link prefetch={false} className="card" href={sectionHref('tienda', sections)}>
            <span className="card__icon">
              <Icon name="productos" size={48} className="" />
            </span>
            <h3>Nuestros productos</h3>
            <span className="card__arrow" aria-hidden="true">
              →
            </span>
          </Link>
          <Link prefetch={false} className="card" href="/tratamientos">
            <span className="card__icon">
              <Icon name="tratamientos" size={48} className="" />
            </span>
            <h3>Tratamientos y servicios</h3>
            <span className="card__arrow" aria-hidden="true">
              →
            </span>
          </Link>
          <Link prefetch={false} className="card" href={sectionHref('consejos', sections)}>
            <span className="card__icon">
              <Icon name="consejos" size={48} className="" />
            </span>
            <h3>Consejos de salud</h3>
            <span className="card__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>

      {stats.length > 0 ? (
        <section className="stats" aria-labelledby="cifras">
          <div className="container">
            <h2 id="cifras" className="stats__title">
              {clinic.name} en cifras
            </h2>
            <div className="stats__grid">
              {stats.map((stat) => (
                <article className="stat" key={stat.slug}>
                  <h3>
                    {stat.valueText} {stat.label}
                  </h3>
                  {stat.description ? <p>{stat.description}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {notices.length > 0 ? (
        <section className="container section section--tight" aria-label="Avisos de salud">
          {notices.map((notice) => (
            <div className="notice" key={notice.slug}>
              <p>
                <strong>{notice.text}</strong>
              </p>
              <span className="notice__source">
                Fuente:{' '}
                <a href={notice.sourceUrl} rel="noopener noreferrer">
                  {notice.sourceLabel}
                </a>
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
