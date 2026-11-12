import Link from 'next/link';

// Migas de pan que empiezan en la portada (FR-008).
export function Breadcrumb({ current, trail = [] }: { current: string; trail?: { href: string; label: string }[] }) {
  return (
    <nav className="breadcrumb" aria-label="Migas de pan">
      <Link prefetch={false} href="/">Página de inicio</Link>
      {trail.map((t) => (
        <span key={t.href}>
          <Link prefetch={false} href={t.href}>
            {t.label}
          </Link>
        </span>
      ))}
      <span aria-current="page">{current}</span>
    </nav>
  );
}
