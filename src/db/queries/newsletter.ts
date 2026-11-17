import { eq } from 'drizzle-orm';
import { cache } from 'react';
import type { ExportNewsletter } from '@/domain/account-export';
import { getDb } from '../client';
import { newsletterSettings, newsletterSubscriptions } from '../schema';

// Ajustes del boletín (feature 006, E13): una fila cargada desde el archivo de contenido.

export interface NewsletterSettings {
  enabled: boolean;
  title: string;
  text: string;
}

/** Ajustes del boletín; sin fila, el boletín está desactivado. */
export const getNewsletterSettings = cache(async (): Promise<NewsletterSettings> => {
  const [row] = await getDb()
    .select({ enabled: newsletterSettings.enabled, title: newsletterSettings.title, text: newsletterSettings.text })
    .from(newsletterSettings)
    .limit(1);
  return row ?? { enabled: false, title: '', text: '' };
});

/** Para el middleware: true si el boletín está activo (una consulta, sin caché de React). */
export async function isNewsletterEnabled(): Promise<boolean> {
  const [row] = await getDb().select({ enabled: newsletterSettings.enabled }).from(newsletterSettings).limit(1);
  return row?.enabled ?? false;
}

/** Suscripción viva vinculada a una cuenta, para "Descargar mis datos" (export v3). */
export async function customerNewsletterForExport(customerId: string): Promise<ExportNewsletter | null> {
  const [row] = await getDb()
    .select({
      status: newsletterSubscriptions.status,
      source: newsletterSubscriptions.source,
      createdAt: newsletterSubscriptions.createdAt,
      confirmedAt: newsletterSubscriptions.confirmedAt,
      policyVersion: newsletterSubscriptions.policyVersion,
    })
    .from(newsletterSubscriptions)
    .where(eq(newsletterSubscriptions.customerId, customerId))
    .limit(1);
  return row ?? null;
}
