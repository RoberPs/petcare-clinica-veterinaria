import { loadContentFile, type LoadSummary } from '@/content/load';
import { getDb } from '@/db/client';
import { petcareContent, writeVariant, type Content } from './catalog';

// Consejos de salud de la demo para las pruebas de integración (feature 006).

/** Carga content/petcare.yaml con los bloques de consejos modificados por `mutate`. */
export async function seedPosts(mutate?: (content: Content) => void): Promise<LoadSummary> {
  const content = petcareContent();
  mutate?.(content);
  return loadContentFile(getDb(), writeVariant(content));
}

/** Publicación mínima válida para añadir en `mutate`. */
export function postFixture(over: Record<string, unknown> = {}): Content {
  return {
    slug: 'publicacion-de-prueba',
    kind: 'article',
    category: 'perro',
    title: 'Publicación de prueba',
    lead: 'Preámbulo de la publicación de prueba.',
    published_on: '2026-01-10',
    body_md: '## Sección\nTexto de prueba.',
    ...over,
  };
}
