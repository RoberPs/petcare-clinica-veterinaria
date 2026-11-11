import { notFound } from 'next/navigation';
import { formatLongDate } from '@/domain/time';
import { getLegalPage, type LegalKind } from '@/db/queries/legal';
import { getSiteData } from '@/db/queries/site';
import { Breadcrumb } from './Breadcrumb';
import { Markdown } from './Markdown';

// Página legal (US8): título, fecha de actualización, texto en Markdown y datos del titular.
export async function LegalPage({ kind }: { kind: LegalKind }) {
  const [site, page] = await Promise.all([getSiteData(), getLegalPage(kind)]);
  if (!page) notFound();
  const { clinic } = site;

  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <Breadcrumb current={page.title} />
          <h1>{page.title}</h1>
          <p>Última actualización: {formatLongDate(page.updatedOn)}</p>
        </div>
      </section>
      <section className="section">
        <div className="container prose">
          <Markdown sections={site.sections}>{page.bodyMd}</Markdown>
          <h2>Datos del titular</h2>
          <ul>
            <li>Titular y responsable: {clinic.legalOwnerName}</li>
            {clinic.legalOwnerTaxId ? <li>NIF: {clinic.legalOwnerTaxId}</li> : null}
            {clinic.legalOwnerAddress ? <li>Domicilio: {clinic.legalOwnerAddress}</li> : null}
            <li>
              Correo para ejercer tus derechos:{' '}
              <a href={`mailto:${clinic.legalContactEmail}`}>{clinic.legalContactEmail}</a>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}

export async function legalMetadata(kind: LegalKind) {
  const [site, page] = await Promise.all([getSiteData(), getLegalPage(kind)]);
  return {
    title: page?.title ?? 'Información legal',
    description: `${page?.title ?? 'Información legal'} de la web de ${site.clinic.name}.`,
  };
}
