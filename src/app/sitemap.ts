import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

// Solo las rutas indexables (contracts/routes.md). "Próximamente", la confirmación y cookies quedan fuera.
const ROUTES = ['/', '/tratamientos', '/la-clinica', '/contacto', '/preguntas-frecuentes', '/aviso-legal', '/privacidad', '/politica-de-cookies', '/terminos'];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return ROUTES.map((path) => ({ url: `${base}${path}`, changeFrequency: 'monthly', priority: path === '/' ? 1 : 0.6 }));
}
