import type { MetadataRoute } from 'next';
import { isSectionEnabled } from '@/domain/sections';
import { listProductSlugs } from '@/db/queries/catalog';
import { getSiteData } from '@/db/queries/site';

export const dynamic = 'force-dynamic';

// Solo las rutas indexables (contracts/routes.md). "Próximamente", la confirmación y cookies quedan fuera.
const ROUTES = ['/', '/tratamientos', '/la-clinica', '/contacto', '/preguntas-frecuentes', '/aviso-legal', '/privacidad', '/politica-de-cookies', '/terminos'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const pages: MetadataRoute.Sitemap = ROUTES.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }));
  // Catálogo (C14): el listado y las fichas visibles, solo con la tienda activa.
  const { sections } = await getSiteData();
  if (!isSectionEnabled('tienda', sections)) return pages;
  const products = await listProductSlugs();
  return [
    ...pages,
    { url: `${base}/productos`, changeFrequency: 'weekly', priority: 0.7 },
    ...products.map((p) => ({ url: `${base}/productos/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'weekly' as const, priority: 0.5 })),
  ];
}
