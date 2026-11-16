import { describe, expect, it } from 'vitest';
import { CHECKOUT_MESSAGES, validateCheckout, type CheckoutSchemaConfig } from '@/domain/checkout-schemas';

const config: CheckoutSchemaConfig = {
  shippingMethods: [
    { code: 'domicilio', kind: 'home_delivery', postalPrefixes: null },
    { code: 'recogida', kind: 'clinic_pickup', postalPrefixes: null },
  ],
  paymentMethods: ['card', 'in_clinic'],
  guest: true,
};
const home = {
  email: 'comprador@example.test',
  first_name: '  Ana ',
  last_name: 'Pérez  López',
  shipping_method: 'domicilio',
  payment_method: 'card',
  address_line: 'Calle Mayor 1, 2.º B',
  postal_code: '28001',
  city: 'Madrid',
};

describe('validateCheckout', () => {
  it('envío a domicilio válido, con espacios normalizados', () => {
    const r = validateCheckout(home, config);
    expect(r).toEqual({
      ok: true,
      data: {
        email: 'comprador@example.test',
        emailNormalized: 'comprador@example.test',
        firstName: 'Ana',
        lastName: 'Pérez López',
        shippingMethod: 'domicilio',
        shippingKind: 'home_delivery',
        addressLine: 'Calle Mayor 1, 2.º B',
        postalCode: '28001',
        city: 'Madrid',
        paymentMethod: 'card',
      },
    });
  });

  it('recogida: ignora y no guarda la dirección', () => {
    const r = validateCheckout({ ...home, shipping_method: 'recogida', address_line: '', postal_code: 'xx', city: '' }, config);
    expect(r.ok && r.data).toMatchObject({ shippingKind: 'clinic_pickup', addressLine: null, postalCode: null, city: null });
  });

  it('mensajes junto a cada campo y los valores escritos', () => {
    const r = validateCheckout({ email: 'no-es-correo', first_name: '', last_name: ' ', shipping_method: 'domicilio', payment_method: 'card', address_line: 'C/', postal_code: '53000', city: '' }, config);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual({
      email: CHECKOUT_MESSAGES.email,
      first_name: CHECKOUT_MESSAGES.firstName,
      last_name: CHECKOUT_MESSAGES.lastName,
      address_line: CHECKOUT_MESSAGES.address,
      postal_code: CHECKOUT_MESSAGES.postalCode,
      city: CHECKOUT_MESSAGES.city,
    });
    expect(r.values.email).toBe('no-es-correo');
  });

  it('fuera de zona', () => {
    const peninsula = { ...config, shippingMethods: [{ code: 'domicilio', kind: 'home_delivery' as const, postalPrefixes: ['28', '08'] }] };
    const r = validateCheckout({ ...home, postal_code: '35001' }, peninsula);
    expect(!r.ok && r.fieldErrors.postal_code).toBe(CHECKOUT_MESSAGES.outOfZone);
  });

  it('pago en clínica solo con recogida', () => {
    const r = validateCheckout({ ...home, payment_method: 'in_clinic' }, config);
    expect(!r.ok && r.fieldErrors.payment_method).toBe(CHECKOUT_MESSAGES.inClinicPickupOnly);
    expect(validateCheckout({ ...home, shipping_method: 'recogida', payment_method: 'in_clinic' }, config).ok).toBe(true);
  });

  it('métodos inactivos o inventados', () => {
    expect(validateCheckout({ ...home, shipping_method: 'dron' }, config)).toMatchObject({ ok: false, fieldErrors: { shipping_method: CHECKOUT_MESSAGES.shipping } });
    expect(validateCheckout({ ...home, payment_method: 'bizum' }, config)).toMatchObject({ ok: false, fieldErrors: { payment_method: CHECKOUT_MESSAGES.payment } });
    expect(validateCheckout({ ...home, payment_method: 'card' }, { ...config, paymentMethods: ['in_clinic'] }).ok).toBe(false);
  });

  it('con sesión no pide correo', () => {
    const r = validateCheckout({ ...home, email: '' }, { ...config, guest: false });
    expect(r.ok && r.data.email).toBeNull();
  });
});
