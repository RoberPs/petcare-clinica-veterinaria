// Secciones futuras (R12): mientras no existan, sus enlaces llevan a /proximamente/<key>.

export const SECTION_KEYS = ['reservas', 'tienda', 'carrito', 'consejos', 'cuenta'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface Section {
  key: SectionKey;
  label: string;
  href: string | null;
}

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

/** Destino actual de una sección: su `href` si existe; si no, la página "Próximamente". */
export function sectionHref(key: SectionKey, sections: readonly Section[]): string {
  const href = sections.find((s) => s.key === key)?.href;
  return href ? href : `/proximamente/${key}`;
}

/** true si la sección ya existe (tiene `href`). */
export function isSectionEnabled(key: SectionKey, sections: readonly Section[]): boolean {
  return !!sections.find((s) => s.key === key)?.href;
}

/**
 * "Pedir cita" de una mascota (B14): la reserva con la mascota preelegida, o "Próximamente" si la
 * reserva está desactivada.
 */
export function petAppointmentHref(sections: readonly Section[], petId: string): string {
  const base = sectionHref('reservas', sections);
  return isSectionEnabled('reservas', sections) ? `${base}?mascota=${encodeURIComponent(petId)}` : base;
}
