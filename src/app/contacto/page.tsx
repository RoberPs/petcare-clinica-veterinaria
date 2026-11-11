import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ClosureNotice } from '@/components/ClosureNotice';
import { ContactForm } from '@/components/ContactForm';
import { Icon } from '@/components/Icon';
import { MapEmbed } from '@/components/MapEmbed';
import { OpenStatus } from '@/components/OpenStatus';
import { summarizeHours } from '@/domain/hours';
import { getContactReasons } from '@/db/queries/contact';
import { getSiteData } from '@/db/queries/site';
import { createSubmissionToken } from '@/lib/form-token';

export async function generateMetadata(): Promise<Metadata> {
  const { clinic } = await getSiteData();
  return {
    title: 'Contacto',
    description: `Escribe o llama a ${clinic.name}: teléfono, horario, dirección y formulario de contacto.`,
    alternates: { canonical: '/contacto' },
  };
}

// Contacto (US5): formulario y, al lado, teléfono destacado con horario, dirección, correo y mapa (FR-031).
export default async function ContactPage() {
  const [site, reasons] = await Promise.all([getSiteData(), getContactReasons()]);
  const { clinic, hours, closures } = site;
  const address = `${clinic.addressLine}, ${clinic.postalCode} ${clinic.city} (${clinic.province})`;

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <Breadcrumb current="Contacto" />
          <h1>Contacto</h1>
        </div>
      </section>
      <div className="container contact-grid">
        {/* Un token nuevo en cada petición: idempotencia del envío y tiempo mínimo (R5 y R6). */}
        <ContactForm
          token={createSubmissionToken()}
          reasons={reasons.map((r) => ({ slug: r.slug, label: r.label }))}
          phoneDisplay={clinic.phoneDisplay}
          phoneE164={clinic.phoneE164}
        />
        <aside className="contact-aside" aria-label="Otras formas de contacto">
          <div className="note note--contact">
            <h2 className="h3">
              <Icon name="telefono" />
              Llámanos
            </h2>
            <p className="note__phone">
              <a href={`tel:${clinic.phoneE164}`}>{clinic.phoneDisplay}</a>
            </p>
            <OpenStatus hours={hours} closures={closures} />
            <p>{summarizeHours(hours).map((l) => `${l.days}: ${l.hours}`).join(' · ')}</p>
            <ClosureNotice closures={closures} />
          </div>
          <div className="info-card">
            <h2 className="h3">
              <Icon name="ubicacion" />
              Dirección
            </h2>
            <p>
              {clinic.addressLine}
              <br />
              {clinic.postalCode} {clinic.city}
            </p>
          </div>
          {clinic.publicEmail ? (
            <div className="info-card">
              <h2 className="h3">
                <Icon name="correo" />
                Correo
              </h2>
              <p>
                <a className="link-underline" href={`mailto:${clinic.publicEmail}`}>
                  {clinic.publicEmail}
                </a>
              </p>
            </div>
          ) : null}
          <MapEmbed latitude={clinic.latitude} longitude={clinic.longitude} address={address} small />
        </aside>
      </div>
    </>
  );
}
