import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isSectionKey } from '@/domain/sections';
import { getSiteData } from '@/db/queries/site';

type Props = { params: Promise<{ key: string }> };

// Dinámica como el resto (R1): sin prerenderizado, para que la CSP con nonce funcione. Las claves
// válidas son SECTION_KEYS; cualquier otra da 404.
export const dynamic = 'force-dynamic';

async function getSection(key: string) {
  if (!isSectionKey(key)) return null;
  const site = await getSiteData();
  const section = site.sections.find((s) => s.key === key);
  return section ? { site, section } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getSection((await params).key);
  if (!found) return { robots: { index: false } };
  return {
    title: `${found.section.label}: próximamente`,
    description: `${found.section.label} estará disponible muy pronto en ${found.site.clinic.name}. Mientras tanto, llámanos o escríbenos.`,
    robots: { index: false, follow: true },
  };
}

// Página "Próximamente" de una sección que todavía no existe (FR-006, R12).
export default async function ComingSoonPage({ params }: Props) {
  const found = await getSection((await params).key);
  if (!found) notFound();
  const { site, section } = found;

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <nav className="breadcrumb" aria-label="Migas de pan">
            <Link prefetch={false} href="/">Página de inicio</Link>
            <span aria-current="page">{section.label}</span>
          </nav>
          <h1>{section.label}: próximamente</h1>
          <p className="preamble">
            Estamos preparando esta sección. Mientras tanto, te atendemos por teléfono o desde el formulario de
            contacto.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="cta-box">
            <h2>¿Te ayudamos ahora?</h2>
            <p>
              Llámanos al <a className="link-underline" href={`tel:${site.clinic.phoneE164}`}>{site.clinic.phoneDisplay}</a>{' '}
              o escríbenos.
            </p>
            <div className="band__actions">
              <Link prefetch={false} className="btn btn--pink" href="/contacto">
                Contacto
              </Link>
              <Link prefetch={false} className="btn btn--ghost" href="/">
                Volver a la portada
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
