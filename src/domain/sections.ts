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
