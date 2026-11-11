import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ClosureNotice } from '@/components/ClosureNotice';
import { Icon } from '@/components/Icon';
import { MapEmbed } from '@/components/MapEmbed';
import { OpenStatus } from '@/components/OpenStatus';
import { TeamMember } from '@/components/TeamMember';
import { WeeklyHours } from '@/components/WeeklyHours';
import { sectionHref } from '@/domain/sections';
import { getClinicPageData } from '@/db/queries/clinic';
import { getSiteData } from '@/db/queries/site';

export async function generateMetadata(): Promise<Metadata> {
  const { clinic } = await getSiteData();
  return {
    title: 'La clínica',
    description: `Dirección, horario, contacto y equipo veterinario de ${clinic.name} en ${clinic.city}.`,
    alternates: { canonical: '/la-clinica' },
  };
}

// La clínica (US4): dirección, horario con su estado, contacto, equipo y mapa con consentimiento.
export default async function ClinicPage() {
  const { site, team } = await getClinicPageData();
  const { clinic, hours, closures, sections } = site;
  const address = `${clinic.addressLine}, ${clinic.postalCode} ${clinic.city} (${clinic.province})`;

  return (
    <>
      <section className="photo-hero">
        {clinic.aboutImagePath ? (
          <Image src={clinic.aboutImagePath} alt={clinic.aboutImageAlt ?? ''} width={1600} height={700} priority sizes="100vw" />
        ) : null}
        <div className="photo-hero__card">
          <h1>{clinic.aboutTitle ?? 'La clínica'}</h1>
          {clinic.aboutText ? <p className="preamble">{clinic.aboutText}</p> : null}
          <Link prefetch={false} className="btn btn--sky" href={sectionHref('reservas', sections)}>
            Pide cita
          </Link>
        </div>
      </section>

      <section className="section" aria-label="Datos de la clínica">
        <div className="container info-grid">
          <div className="info-card">
            <h2 className="h3">
              <Icon name="ubicacion" />
              Dónde estamos
            </h2>
            <p>
              {clinic.addressLine}
              <br />
              {clinic.postalCode} {clinic.city} ({clinic.province})
            </p>
          </div>
          <div className="info-card">
            <h2 className="h3">
              <Icon name="horario" />
              Horario
            </h2>
            <OpenStatus hours={hours} closures={closures} />
            <WeeklyHours hours={hours} />
            <ClosureNotice closures={closures} />
          </div>
          <div className="info-card">
            <h2 className="h3">
              <Icon name="telefono" />
              Contacto
            </h2>
            <p>
              <a className="link-underline" href={`tel:${clinic.phoneE164}`}>
                {clinic.phoneDisplay}
              </a>
              {clinic.publicEmail ? (
                <>
                  <br />
                  <a className="link-underline" href={`mailto:${clinic.publicEmail}`}>
                    {clinic.publicEmail}
                  </a>
                </>
              ) : null}
            </p>
            <Link prefetch={false} className="btn btn--sm btn--pink" href="/contacto">
              Contacto
            </Link>
          </div>
        </div>
      </section>

      {team.length > 0 ? (
        <section className="section section--white" aria-labelledby="equipo">
          <div className="container">
            <h2 id="equipo">Nuestro equipo</h2>
            <div className="team">
              {team.map((m) => (
                <TeamMember key={m.slug} name={m.name} specialty={m.specialty} photoPath={m.photoPath} photoAlt={m.photoAlt} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {clinic.latitude && clinic.longitude ? (
        <section className="section" aria-labelledby="como-llegar">
          <div className="container">
            <h2 id="como-llegar">Cómo llegar</h2>
            <MapEmbed latitude={clinic.latitude} longitude={clinic.longitude} address={address} />
          </div>
        </section>
      ) : null}

      <section className="band">
        <div className="container band__row">
          <h2>¿Quieres conocernos?</h2>
          <div className="band__actions">
            <Link prefetch={false} className="btn btn--sky" href={sectionHref('reservas', sections)}>
              Pide cita online
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
