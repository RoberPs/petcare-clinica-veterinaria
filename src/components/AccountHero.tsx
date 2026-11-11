'use client';

import { usePathname } from 'next/navigation';

// Banda superior del área personal (design/cuenta.html): el título de cada sección. Está en el
// layout, encima del menú lateral; con JavaScript se actualiza al navegar entre secciones.

const TITLES: [RegExp, string][] = [
  [/^\/mi-cuenta\/mascotas\/nueva\/?$/, 'Añadir mascota'],
  [/^\/mi-cuenta\/mascotas\/[^/]+\/editar\/?$/, 'Editar mascota'],
  [/^\/mi-cuenta\/mascotas\/[^/]+\/eliminar\/?$/, 'Eliminar mascota'],
  [/^\/mi-cuenta\/mascotas\/?$/, 'Mis mascotas'],
  [/^\/mi-cuenta\/datos\/?$/, 'Datos personales'],
  [/^\/mi-cuenta\/eliminar-cuenta\/?$/, 'Eliminar mi cuenta'],
];

export function AccountHero({ firstName }: { firstName: string }) {
  const pathname = usePathname();
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? `Hola, ${firstName}`;
  return (
    <section className="page-hero page-hero--compact">
      <div className="container">
        <h1>{title}</h1>
      </div>
    </section>
  );
}
