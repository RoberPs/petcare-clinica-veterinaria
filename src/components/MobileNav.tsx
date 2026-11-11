import Link from 'next/link';
import type { Section } from '@/domain/sections';
import { sectionHref } from '@/domain/sections';
import { MobileNavEnhancer } from './MobileNavEnhancer';
import { NavLink } from './NavLink';
import { mainNavItems } from './nav-items';

// Menú desplegable (FR-004). Es un <details>, así que se abre y se cierra sin JavaScript.
// Con JavaScript, MobileNavEnhancer añade Escape, la retención del foco y el cierre al navegar.
export function MobileNav({ sections }: { sections: Section[] }) {
  return (
    <details className="mobile-nav" data-mobile-nav="">
      <summary className="nav-toggle btn btn--ghost btn--sm">Menú</summary>
      <nav className="mobile-nav__panel" aria-label="Menú">
        {mainNavItems(sections).map((item) => (
          <NavLink key={item.label} href={item.href}>
            {item.label}
          </NavLink>
        ))}
        <div className="mobile-nav__chips">
          <Link prefetch={false} className="chip btn btn--sky btn--sm" href={sectionHref('reservas', sections)}>
            Pide cita
          </Link>
          <Link prefetch={false} className="chip btn btn--pink btn--sm" href="/contacto">
            Contacto
          </Link>
          <Link prefetch={false} className="chip btn btn--ghost btn--sm mobile-nav__account" href={sectionHref('cuenta', sections)}>
            Mi cuenta
          </Link>
        </div>
      </nav>
      <MobileNavEnhancer />
    </details>
  );
}
