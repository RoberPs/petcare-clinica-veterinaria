import type { MetadataRoute } from 'next';
import { isSectionEnabled } from '@/domain/sections';
import { listProductSlugs } from '@/db/queries/catalog';
import { getNewsletterSettings } from '@/db/queries/newsletter';
import { listVisiblePostSlugs } from '@/db/queries/posts';
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
  // Condiciones de venta (feature 005): solo con la compra activa.
  if (isSectionEnabled('carrito', sections)) {
    pages.push({ url: `${base}/condiciones-de-venta`, changeFrequency: 'monthly', priority: 0.6 });
  }
  // Consejos (feature 006): el listado y cada publicación visible; la política del boletín si está activo.
  if (isSectionEnabled('consejos', sections)) {
    const posts = await listVisiblePostSlugs();
    pages.push(
      { url: `${base}/consejos`, changeFrequency: 'weekly', priority: 0.7 },
      ...posts.map((p) => ({ url: `${base}/consejos/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly' as const, priority: 0.5 })),
    );
  }
  if ((await getNewsletterSettings())?.enabled) {
    pages.push({ url: `${base}/politica-del-boletin`, changeFrequency: 'monthly', priority: 0.3 });
  }
  if (!isSectionEnabled('tienda', sections)) return pages;
  const products = await listProductSlugs();
  return [
    ...pages,
    { url: `${base}/productos`, changeFrequency: 'weekly', priority: 0.7 },
    ...products.map((p) => ({ url: `${base}/productos/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'weekly' as const, priority: 0.5 })),
  ];
}
