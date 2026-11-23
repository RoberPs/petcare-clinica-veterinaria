import { sectionHref, type Section } from '@/domain/sections';

// Orden de la navegación principal (FR-003): Tratamientos · La clínica · Nuestros productos ·
// Consejos de salud · Preguntas frecuentes.
export function mainNavItems(sections: readonly Section[]): { href: string; label: string }[] {
  return [
    { href: '/tratamientos', label: 'Tratamientos' },
    { href: '/la-clinica', label: 'La clínica' },
    { href: sectionHref('tienda', sections), label: 'Nuestros productos' },
    { href: sectionHref('consejos', sections), label: 'Consejos de salud' },
    { href: '/preguntas-frecuentes', label: 'Preguntas frecuentes' },
  ];
}
