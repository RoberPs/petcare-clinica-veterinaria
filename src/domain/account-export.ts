import { Temporal } from '@js-temporal/polyfill';
import { petAge, todayInClinicZone } from './pet-age';
import { CLINIC_TZ, todayInClinic } from './time';

// "Descargar mis datos" (A11, contracts/export-format.md). Solo los datos que ha aportado el cliente
// o que describen su cuenta: ni ids internos, ni el hash de la contraseña, ni sesiones, ni tokens.

export interface AccountExportInput {
  controller: { name: string; contactEmail: string };
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
    emailVerifiedAt: Date | null;
    marketingOptIn: boolean;
    marketingOptInChangedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  consents: { kind: string; privacyVersion: string | null; termsVersion: string | null; createdAt: Date }[];
  pets: {
    name: string;
    speciesKey: string | null;
    speciesLabel: string | null;
    birthDate: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Instante en Europe/Madrid con su desfase, sin fracciones: "2026-11-11T10:15:00+01:00". */
function zonedIso(now: Date): string {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(CLINIC_TZ)
    .toString({ timeZoneName: 'never', smallestUnit: 'second' });
}

export function buildAccountExport(data: AccountExportInput, now: Date) {
  const c = data.customer;
  const today = todayInClinicZone(now);
  return {
    format_version: 1 as const,
    exported_at: zonedIso(now),
    controller: { name: data.controller.name, contact_email: data.controller.contactEmail },
    account: {
      email: c.email,
      first_name: c.firstName,
      last_name: c.lastName,
      phone: c.phone,
      address: { line: c.addressLine, postal_code: c.postalCode, city: c.city, province: c.province },
      email_verified_at: iso(c.emailVerifiedAt),
      created_at: iso(c.createdAt),
      updated_at: iso(c.updatedAt),
    },
    communications: { marketing_opt_in: c.marketingOptIn, changed_at: iso(c.marketingOptInChangedAt) },
    consents: data.consents.map((k) => ({
      kind: k.kind,
      privacy_version: k.privacyVersion,
      terms_version: k.termsVersion,
      at: iso(k.createdAt),
    })),
    pets: data.pets.map((p) => ({
      name: p.name,
      species: p.speciesLabel ?? 'Otra',
      species_key: p.speciesKey,
      birth_date: p.birthDate,
      age_at_export: petAge(Temporal.PlainDate.from(p.birthDate), today),
      created_at: iso(p.createdAt),
      updated_at: iso(p.updatedAt),
    })),
  };
}

export type AccountExport = ReturnType<typeof buildAccountExport>;

export function exportFileName(now: Date): string {
  return `mis-datos-${todayInClinic(now)}.json`;
}
