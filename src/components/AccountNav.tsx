'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/mi-cuenta/cerrar-sesion/actions';

interface Props {
  /** Destinos de "Mis citas" y "Mis pedidos" (sectionHref: "Próximamente" hasta que existan). */
  appointmentsHref: string;
  ordersHref: string;
}

// Menú lateral del área personal (design/cuenta.html). Marca la sección actual con aria-current;
// sin JavaScript, el servidor lo pinta con la ruta de la petición.
export function AccountNav({ appointmentsHref, ordersHref }: Props) {
  const pathname = usePathname();
  const items = [
    { href: '/mi-cuenta', label: 'Resumen', exact: true },
    { href: '/mi-cuenta/mascotas', label: 'Mis mascotas' },
    { href: appointmentsHref, label: 'Mis citas' },
    { href: ordersHref, label: 'Mis pedidos' },
    { href: '/mi-cuenta/datos', label: 'Datos personales' },
  ];
  const isCurrent = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="side-nav" aria-label="Mi cuenta">
      {items.map((item) => (
        <Link
          key={item.label}
          prefetch={false}
          href={item.href}
          aria-current={isCurrent(item.href, item.exact) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
      <form action={logout}>
        <button type="submit">Cerrar sesión</button>
      </form>
    </nav>
  );
}
