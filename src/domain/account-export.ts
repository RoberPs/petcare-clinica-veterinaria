import { Temporal } from '@js-temporal/polyfill';
import { appointmentView } from './appointment-view';
import { formatEur } from './money';
import { PAYMENT_METHOD_LABELS, statusLabel, type OrderStatus, type PaymentMethod, type RefundStatus } from './order-status';
import { petAge, todayInClinicZone } from './pet-age';
import { CLINIC_TZ, todayInClinic } from './time';

// "Descargar mis datos" (A11, contracts/export-format.md; versión 2 con los pedidos, feature 005). Solo los datos que ha aportado el cliente
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
  /** Citas con customer_id de la cuenta (feature 003, contracts/export-format.md). */
  appointments?: {
    serviceName: string;
    staffName: string;
    petName: string;
    petSpeciesLabel: string;
    startsAt: Date;
    endsAt: Date;
    status: 'confirmed' | 'cancelled';
    cancelledBy: 'customer' | 'clinic' | 'system' | null;
    reason: string | null;
    contactPhone: string | null;
    createdAt: Date;
  }[];
  /** Pedidos con customer_id de la cuenta (feature 005, export v2). Nunca los de invitado. */
  orders?: ExportOrder[];
}

export interface ExportOrder {
  number: string;
  createdAt: Date;
  status: OrderStatus;
  refundStatus: RefundStatus;
  paymentMethod: PaymentMethod;
  shippingName: string;
  firstName: string | null;
  lastName: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  discountCode: string | null;
  discountCents: number;
  subtotalCents: number;
  shippingCostCents: number;
  totalCents: number;
  vatCents: number;
  items: { productName: string; quantity: number; unitPriceCents: number; vatRate: number }[];
}

const STATE_EXPORT = { confirmed: 'confirmada', cancelled: 'cancelada', done: 'realizada' } as const;
const ACTOR_EXPORT = { customer: 'cliente', clinic: 'clinica', system: 'sistema' } as const;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Instante en Europe/Madrid con su desfase, sin fracciones: "2026-11-11T10:15:00+01:00". */
export function zonedIso(now: Date): string {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(CLINIC_TZ)
    .toString({ timeZoneName: 'never', smallestUnit: 'second' });
}

export function buildAccountExport(data: AccountExportInput, now: Date) {
  const c = data.customer;
  const today = todayInClinicZone(now);
  return {
    format_version: 2 as const,
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
    citas: [...(data.appointments ?? [])]
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
      .map((a) => ({
        servicio: a.serviceName,
        profesional: a.staffName,
        mascota: a.petName,
        especie: a.petSpeciesLabel,
        inicio: zonedIso(a.startsAt),
        fin: zonedIso(a.endsAt),
        // El estado visible no depende del plazo de cambio: se pasa 0.
        estado: STATE_EXPORT[appointmentView(a, now, 0).state],
        cancelada_por: a.cancelledBy ? ACTOR_EXPORT[a.cancelledBy] : null,
        motivo: a.reason,
        telefono_contacto: a.contactPhone,
        reservada_el: zonedIso(a.createdAt),
      })),
    orders: [...(data.orders ?? [])]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((o) => ({
        number: o.number,
        created_at: zonedIso(o.createdAt),
        status: statusLabel(o.status),
        refunded: o.refundStatus === 'refunded',
        payment_method: PAYMENT_METHOD_LABELS[o.paymentMethod],
        shipping: {
          method: o.shippingName,
          first_name: o.firstName,
          last_name: o.lastName,
          address_line: o.addressLine,
          postal_code: o.postalCode,
          city: o.city,
        },
        items: o.items.map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          unit_price: formatEur(i.unitPriceCents),
          total: formatEur(i.unitPriceCents * i.quantity),
          vat_rate: i.vatRate,
        })),
        discount: o.discountCode ? { code: o.discountCode, amount: formatEur(o.discountCents) } : null,
        subtotal: formatEur(o.subtotalCents),
        shipping_cost: formatEur(o.shippingCostCents),
        total: formatEur(o.totalCents),
        vat_included: formatEur(o.vatCents),
      })),
  };
}

export type AccountExport = ReturnType<typeof buildAccountExport>;

export function exportFileName(now: Date): string {
  return `mis-datos-${todayInClinic(now)}.json`;
}
