import Link from 'next/link';
import { summarizeHours } from '@/domain/hours';
import type { SiteData } from '@/db/queries/site';
import { OpenStatus } from './OpenStatus';

// Pie común (FR-007): contacto, horario con su estado, secciones, los 4 enlaces legales y cookies.
export function SiteFooter({ site }: { site: SiteData }) {
  const { clinic, hours, closures } = site;
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer__grid">
          <div>
            <h2>{clinic.name}</h2>
            <p>
              <a href={`tel:${clinic.phoneE164}`}>{clinic.phoneDisplay}</a>
            </p>
            {clinic.publicEmail ? (
              <p>
                <a href={`mailto:${clinic.publicEmail}`}>{clinic.publicEmail}</a>
              </p>
            ) : null}
            <p>
              {clinic.addressLine}, {clinic.postalCode} {clinic.city}
            </p>
            <OpenStatus hours={hours} closures={closures} />
            <ul className="footer__list" aria-label="Horario">
              {summarizeHours(hours).map((line) => (
                <li key={line.days}>
                  {line.days}: {line.hours}
                </li>
              ))}
            </ul>
          </div>
          <nav aria-label="Secciones">
            <h2>La web</h2>
            <ul className="footer__list">
              <li>
                <Link prefetch={false} href="/la-clinica">La clínica</Link>
              </li>
              <li>
                <Link prefetch={false} href="/tratamientos">Tratamientos</Link>
              </li>
              <li>
                <Link prefetch={false} href="/contacto">Contacto</Link>
              </li>
              <li>
                <Link prefetch={false} href="/preguntas-frecuentes">Preguntas frecuentes</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Información legal">
            <h2>Información legal</h2>
            <ul className="footer__list">
              <li>
                <Link prefetch={false} href="/aviso-legal">Aviso legal</Link>
              </li>
              <li>
                <Link prefetch={false} href="/privacidad">Política de privacidad</Link>
              </li>
              <li>
                <Link prefetch={false} href="/politica-de-cookies">Política de cookies</Link>
              </li>
              <li>
                <Link prefetch={false} href="/terminos">Términos de uso</Link>
              </li>
              <li>
                <Link prefetch={false} href="/cookies/configurar">Configurar cookies</Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
