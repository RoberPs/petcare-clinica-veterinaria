import { z } from 'zod';
import { echoValues, normalizeEmail, type FieldErrors, type FormValues } from './account-schemas';
import type { PaymentMethod, ShippingKind } from './order-status';
import { inZone, isSpanishPostalCode } from './shipping';

// Datos del checkout (FR-007, data-model.md "Validaciones"): solo los imprescindibles, con
// mensajes en español. La dirección solo se exige con envío a domicilio y se descarta con recogida.

export const CHECKOUT_MESSAGES = {
  email: 'Escribe un correo válido',
  firstName: 'Escribe tu nombre',
  lastName: 'Escribe tus apellidos',
  address: 'Escribe la dirección (calle, número, piso)',
  postalCode: 'Código postal no válido',
  outOfZone: 'No enviamos a este código postal. Puedes recogerlo en la clínica.',
  city: 'Escribe la ciudad',
  shipping: 'Elige cómo quieres recibir el pedido',
  payment: 'Elige cómo quieres pagar',
  inClinicPickupOnly: 'El pago en clínica solo está disponible con recogida en la clínica',
} as const;

export const CHECKOUT_LIMITS = { email: 254, name: 60, address: 120, city: 60 } as const;

export interface CheckoutSchemaConfig {
  shippingMethods: readonly { code: string; kind: ShippingKind; postalPrefixes: readonly string[] | null }[];
  paymentMethods: readonly PaymentMethod[];
  /** Sin sesión se pide el correo; con sesión se usa el de la cuenta. */
  guest: boolean;
}

export interface CheckoutData {
  email: string | null;
  emailNormalized: string | null;
  firstName: string;
  lastName: string;
  shippingMethod: string;
  shippingKind: ShippingKind;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  paymentMethod: PaymentMethod;
}

const str = z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string());
const collapse = (s: string) => s.trim().replace(/\s+/g, ' ');

export type CheckoutValidation = { ok: true; data: CheckoutData } | { ok: false; fieldErrors: FieldErrors; values: FormValues };

export function validateCheckout(raw: Record<string, unknown>, config: CheckoutSchemaConfig): CheckoutValidation {
  const schema = z
    .object({
      email: str,
      first_name: str.transform(collapse).pipe(z.string().min(1, CHECKOUT_MESSAGES.firstName).max(CHECKOUT_LIMITS.name, CHECKOUT_MESSAGES.firstName)),
      last_name: str.transform(collapse).pipe(z.string().min(1, CHECKOUT_MESSAGES.lastName).max(CHECKOUT_LIMITS.name, CHECKOUT_MESSAGES.lastName)),
      shipping_method: str,
      payment_method: str,
      address_line: str.transform(collapse),
      postal_code: str.transform((s) => s.replace(/\s+/g, '')),
      city: str.transform(collapse),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
      if (config.guest) {
        const email = v.email.trim();
        if (email.length > CHECKOUT_LIMITS.email || !z.string().email().safeParse(email).success) issue('email', CHECKOUT_MESSAGES.email);
      }
      const method = config.shippingMethods.find((m) => m.code === v.shipping_method);
      if (!method) issue('shipping_method', CHECKOUT_MESSAGES.shipping);
      if (!(config.paymentMethods as readonly string[]).includes(v.payment_method)) {
        issue('payment_method', CHECKOUT_MESSAGES.payment);
      } else if (v.payment_method === 'in_clinic' && method && method.kind !== 'clinic_pickup') {
        issue('payment_method', CHECKOUT_MESSAGES.inClinicPickupOnly);
      }
      if (method?.kind === 'home_delivery') {
        if (v.address_line.length < 5 || v.address_line.length > CHECKOUT_LIMITS.address) issue('address_line', CHECKOUT_MESSAGES.address);
        if (!isSpanishPostalCode(v.postal_code)) issue('postal_code', CHECKOUT_MESSAGES.postalCode);
        else if (!inZone(v.postal_code, method.postalPrefixes)) issue('postal_code', CHECKOUT_MESSAGES.outOfZone);
        if (v.city.length < 2 || v.city.length > CHECKOUT_LIMITS.city) issue('city', CHECKOUT_MESSAGES.city);
      }
    });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? '_form')] ??= i.message;
    return { ok: false, fieldErrors, values: echoValues(raw) };
  }
  const v = parsed.data;
  const method = config.shippingMethods.find((m) => m.code === v.shipping_method)!;
  const home = method.kind === 'home_delivery';
  const email = config.guest ? v.email.trim() : null;
  return {
    ok: true,
    data: {
      email,
      emailNormalized: email ? normalizeEmail(email) : null,
      firstName: v.first_name,
      lastName: v.last_name,
      shippingMethod: method.code,
      shippingKind: method.kind,
      // Con recogida no se guarda ninguna dirección (minimización, FR-007).
      addressLine: home ? v.address_line : null,
      postalCode: home ? v.postal_code : null,
      city: home ? v.city : null,
      paymentMethod: v.payment_method as PaymentMethod,
    },
  };
}
