import { asc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { teamMembers } from '../schema';
import { getSiteData, type SiteData } from './site';

export interface ClinicPageData {
  site: SiteData;
  team: { slug: string; name: string; specialty: string; photoPath: string | null; photoAlt: string | null }[];
}

/** Datos de La clínica: los comunes (clínica, horario y cierres de los próximos 30 días) y el equipo publicado. */
export async function getClinicPageData(): Promise<ClinicPageData> {
  const [site, team] = await Promise.all([
    getSiteData(),
    getDb()
      .select({
        slug: teamMembers.slug,
        name: teamMembers.name,
        specialty: teamMembers.specialty,
        photoPath: teamMembers.photoPath,
        photoAlt: teamMembers.photoAlt,
      })
      .from(teamMembers)
      .where(eq(teamMembers.published, true))
      .orderBy(asc(teamMembers.position), asc(teamMembers.slug)),
  ]);
  return { site, team };
}
