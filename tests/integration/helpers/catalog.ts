import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadContentFile, type LoadSummary } from '@/content/load';
import { getDb } from '@/db/client';
import { q } from './db';

// Catálogo de la demo para las pruebas de integración (feature 004).

export type Content = Record<string, any>;
export type ShopBlock = Content;

/** El archivo de la demo, con el bloque shop: tal cual. */
export function petcareContent(): Content {
  return parse(readFileSync('content/petcare.yaml', 'utf8')) as Content;
}

/** Escribe una variante del archivo en un directorio temporal y devuelve su ruta. */
export function writeVariant(content: Content): string {
  const file = join(mkdtempSync(join(tmpdir(), 'petcare-shop-')), 'shop.yaml');
  writeFileSync(file, stringify(content));
  return file;
}

/** Carga content/petcare.yaml con el bloque shop: modificado por `mutate`. */
export async function seedCatalog(mutate?: (shop: ShopBlock, content: Content) => void): Promise<LoadSummary> {
  const content = petcareContent();
  mutate?.(content.shop, content);
  return loadContentFile(getDb(), writeVariant(content));
}

/** Producto del bloque shop: por slug (para modificarlo en `mutate`). */
export function product(shop: ShopBlock, slug: string): Content {
  const p = shop.products.find((x: Content) => x.slug === slug);
  if (!p) throw new Error(`No existe el producto ${slug} en content/petcare.yaml`);
  return p;
}

/** Mapa slug → id de los productos en la base. */
export async function productIds(): Promise<Map<string, string>> {
  return new Map((await q<{ slug: string; id: string }>('SELECT slug, id FROM products')).map((r) => [r.slug, r.id]));
}
