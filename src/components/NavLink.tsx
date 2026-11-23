'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Enlace de navegación que marca la página actual con aria-current (FR-005). Funciona también sin
// JavaScript: el servidor lo renderiza con la ruta de la petición.
export function NavLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
  return (
    <Link prefetch={false} href={href} className={className} aria-current={current ? 'page' : undefined}>
      {children}
    </Link>
  );
}
