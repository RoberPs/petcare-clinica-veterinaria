import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { activityStats, healthNotices } from '../schema';
import { getSiteData, type SiteData } from './site';

export interface HomeData {
  site: SiteData;
  stats: { slug: string; valueText: string; label: string; description: string | null }[];
  /** Avisos de salud publicados: por esquema siempre tienen fuente (FR-011). */
  notices: { slug: string; text: string; sourceLabel: string; sourceUrl: string }[];
}

export async function getHomeData(): Promise<HomeData> {
  const db = getDb();
  const [site, stats, notices] = await Promise.all([
    getSiteData(),
    db
      .select({
        slug: activityStats.slug,
        valueText: activityStats.valueText,
        label: activityStats.label,
        description: activityStats.description,
      })
      .from(activityStats)
      .where(eq(activityStats.published, true))
      .orderBy(asc(activityStats.position), asc(activityStats.slug)),
    db
      .select({
        slug: healthNotices.slug,
        text: healthNotices.text,
        sourceLabel: healthNotices.sourceLabel,
        sourceUrl: healthNotices.sourceUrl,
      })
      .from(healthNotices)
      .where(and(eq(healthNotices.published, true)))
      .orderBy(asc(healthNotices.position), asc(healthNotices.slug)),
  ]);
  return { site, stats, notices };
}
