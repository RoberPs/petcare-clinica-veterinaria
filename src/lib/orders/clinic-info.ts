import { asc } from 'drizzle-orm';
import { summarizeHours } from '@/domain/hours';
import { getDb } from '@/db/client';
import { clinic, openingHours } from '@/db/schema';

/** Dirección y horario resumido de la clínica para la recogida (de la base, nunca del código). */
export async function clinicPickupInfo(): Promise<{ address: string; hours: string[]; phoneDisplay: string; phoneE164: string }> {
  const db = getDb();
  const [[c], hours] = await Promise.all([
    db
      .select({ addressLine: clinic.addressLine, postalCode: clinic.postalCode, city: clinic.city, phoneDisplay: clinic.phoneDisplay, phoneE164: clinic.phoneE164 })
      .from(clinic)
      .limit(1),
    db
      .select({ weekday: openingHours.weekday, opensAt: openingHours.opensAt, closesAt: openingHours.closesAt })
      .from(openingHours)
      .orderBy(asc(openingHours.weekday), asc(openingHours.opensAt)),
  ]);
  return {
    address: c ? `${c.addressLine}, ${c.postalCode} ${c.city}` : '',
    hours: summarizeHours(hours).map((l) => `${l.days}: ${l.hours}`),
    phoneDisplay: c?.phoneDisplay ?? '',
    phoneE164: c?.phoneE164 ?? '',
  };
}
