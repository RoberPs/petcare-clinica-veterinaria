'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Menú lateral del panel (F15). Marca la sección actual con aria-current; sin JavaScript, el
// servidor lo pinta con la ruta de la petición. El detalle de una cita cuelga de "Agenda".

const ITEMS = [
  { href: '/admin/agenda', label: 'Agenda', also: ['/admin/citas'] },
  { href: '/admin/servicios', label: 'Servicios', also: [] },
  { href: '/admin/veterinarios', label: 'Veterinarios', also: [] },
  { href: '/admin/bloqueos', label: 'Bloqueos', also: [] },
  // Tienda (feature 008, G1): el alta, la edición y el stock cuelgan de cada lista.
  { href: '/admin/productos', label: 'Productos', also: [] },
  { href: '/admin/pedidos', label: 'Pedidos', also: [] },
  { href: '/admin/descuentos', label: 'Descuentos', also: [] },
];

export function AdminNav() {
  const pathname = usePathname();
  const isCurrent = (href: string, also: string[]) =>
    [href, ...also].some((h) => pathname === h || pathname.startsWith(`${h}/`));
  return (
    <nav className="side-nav" aria-label="Panel de administración">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          prefetch={false}
          href={item.href}
          aria-current={isCurrent(item.href, item.also) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
      <Link prefetch={false} href="/mi-cuenta">
        Volver a mi cuenta
      </Link>
    </nav>
  );
}
