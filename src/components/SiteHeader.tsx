import Image from 'next/image';
import Link from 'next/link';
import { sectionHref } from '@/domain/sections';
import type { SiteData } from '@/db/queries/site';
import { CartLink } from './CartLink';
import { MobileNav } from './MobileNav';
import { NavLink } from './NavLink';
import { mainNavItems } from './nav-items';

// Cabecera común (FR-002 a FR-005). A la derecha: Mi cuenta · Pide cita · Contacto · Carrito (el último).
export function SiteHeader({ site }: { site: SiteData }) {
  const { clinic, sections } = site;
  return (
    <header className="site-header">
      <div className="bar">
        <Link prefetch={false} className="logo" href="/" aria-label={`${clinic.name}, ir a la portada`}>
          {clinic.logoPath ? <Image src={clinic.logoPath} alt="" width={160} height={40} priority /> : clinic.name}
        </Link>
        <nav className="main-nav" aria-label="Principal">
          {mainNavItems(sections).map((item) => (
            <NavLink key={item.label} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <MobileNav sections={sections} />
        <div className="header-cta">
          <Link prefetch={false} className="chip btn btn--ghost btn--sm header-cta__account" href={sectionHref('cuenta', sections)}>
            Mi cuenta
          </Link>
          <Link prefetch={false} className="chip btn btn--sky btn--sm" href={sectionHref('reservas', sections)}>
            Pide cita
          </Link>
          <Link prefetch={false} className="chip btn btn--pink btn--sm" href="/contacto">
            Contacto
          </Link>
          <CartLink sections={sections} />
        </div>
      </div>
    </header>
  );
}
