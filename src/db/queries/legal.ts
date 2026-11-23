import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { legalPages } from '../schema';

export type LegalKind = (typeof legalPages.$inferSelect)['kind'];

export async function getLegalPage(kind: LegalKind) {
  const [row] = await getDb()
    .select({ title: legalPages.title, bodyMd: legalPages.bodyMd, version: legalPages.version, updatedOn: legalPages.updatedOn })
    .from(legalPages)
    .where(eq(legalPages.kind, kind))
    .limit(1);
  return row ?? null;
}
