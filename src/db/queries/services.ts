import { asc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { services } from '../schema';

/** Servicios publicados en el orden configurado (FR-013). */
export async function getPublishedServices() {
  return getDb()
    .select({ slug: services.slug, name: services.name, description: services.description })
    .from(services)
    .where(eq(services.published, true))
    .orderBy(asc(services.position), asc(services.slug));
}
