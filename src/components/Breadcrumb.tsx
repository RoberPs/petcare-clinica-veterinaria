import Link from 'next/link';

// Migas de pan que empiezan en la portada (FR-008).
export function Breadcrumb({ current }: { current: string }) {
  return (
    <nav className="breadcrumb" aria-label="Migas de pan">
      <Link prefetch={false} href="/">Página de inicio</Link>
      <span aria-current="page">{current}</span>
    </nav>
  );
}
