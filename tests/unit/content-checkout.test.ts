import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { checkoutSchema, parseContent } from '@/content/schema';

const env = {
  CLINIC_PHONE_E164: '+34600000000',
  CLINIC_PHONE_DISPLAY: '600 00 00 00',
  CLINIC_INBOX_EMAIL: 'buzon@example.test',
  LEGAL_OWNER_NAME: 'Responsable de Pruebas',
  LEGAL_CONTACT_EMAIL: 'derechos@example.test',
};

// Ejemplo de contracts/content-file.md.
const example = () =>
  parse(`
order_prefix: "PC-"
reservation_minutes: 30
pickup_days: 7
cart_retention_days: 30
max_qty_per_line: 10
max_pending_per_email: 3
max_pending_per_customer: 3
guest_link_days: 90
notice: "Tienda de demostración: los pagos son de prueba, no se cobra nada y no se envía ningún producto."
payment_methods:
  card: true
  in_clinic: true
shipping_methods:
  - code: domicilio
    kind: home_delivery
    name: Envío a domicilio
    description: Entrega en 24-48 h
    cost: "0,00"
    vat_rate: 21
    postal_prefixes: null
  - code: recogida
    kind: clinic_pickup
    name: Recogida en la clínica
    description: Recógelo en la clínica en su horario
    cost: "0,00"
    vat_rate: 21
discount_codes:
  - code: BIENVENIDA10
    kind: percent
    value: 10
    ends_at: 2027-12-31
  - code: PETCARE5
    kind: fixed
    value: "5,00"
    min_subtotal: "30,00"
    max_uses: 100
`) as Record<string, any>;

function issuesOf(checkout: Record<string, any>) {
  const result = checkoutSchema.safeParse(checkout);
  return result.success ? [] : result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

describe('bloque checkout: (contracts/content-file.md)', () => {
  it('acepta el ejemplo del contrato y convierte los importes a céntimos', () => {
    const result = checkoutSchema.safeParse(example());
    expect(result.success).toBe(true);
    const data = result.data!;
    expect(data.shipping_methods[0]!.cost).toBe(0);
    expect(data.discount_codes[1]).toMatchObject({ kind: 'fixed', value: 500, min_subtotal: 3000, max_uses: 100 });
    expect(data.discount_codes[0]).toMatchObject({ kind: 'percent', value: 10, ends_at: '2027-12-31' });
  });

  it('rechaza sin métodos de pago activos', () => {
    const c = example();
    c.payment_methods = { card: false, in_clinic: false };
    expect(issuesOf(c).some((i) => i.path === 'payment_methods')).toBe(true);
  });

  it('rechaza sin métodos de envío', () => {
    const c = example();
    c.shipping_methods = [];
    expect(issuesOf(c).some((i) => i.path === 'shipping_methods')).toBe(true);
  });

  it('rechaza in_clinic sin un método de recogida', () => {
    const c = example();
    c.shipping_methods = [c.shipping_methods[0]];
    expect(issuesOf(c).some((i) => i.path === 'payment_methods.in_clinic')).toBe(true);
  });

  it('rechaza dos métodos clinic_pickup', () => {
    const c = example();
    c.shipping_methods.push({ ...c.shipping_methods[1], code: 'recogida-2' });
    expect(issuesOf(c).some((i) => i.path === 'shipping_methods.2.kind')).toBe(true);
  });

  it('rechaza códigos de envío o de descuento duplicados', () => {
    const c = example();
    c.shipping_methods[1].code = 'domicilio';
    c.discount_codes[1].code = 'BIENVENIDA10';
    const issues = issuesOf(c);
    expect(issues.some((i) => i.path === 'shipping_methods.1' && i.message.includes('repetido'))).toBe(true);
    expect(issues.some((i) => i.path === 'discount_codes.1' && i.message.includes('repetido'))).toBe(true);
  });

  it('rechaza el prefijo postal 53', () => {
    const c = example();
    c.shipping_methods[0].postal_prefixes = ['28', '53'];
    expect(issuesOf(c).some((i) => i.path === 'shipping_methods.0.postal_prefixes.1')).toBe(true);
  });

  it('rechaza un porcentaje de 0 o de 101', () => {
    for (const value of [0, 101]) {
      const c = example();
      c.discount_codes[0].value = value;
      expect(issuesOf(c).some((i) => i.path === 'discount_codes.0.value')).toBe(true);
    }
  });

  it('rechaza un importe fijo de "0,00"', () => {
    const c = example();
    c.discount_codes[1].value = '0,00';
    expect(issuesOf(c).some((i) => i.path === 'discount_codes.1.value')).toBe(true);
  });

  it('rechaza ends_at anterior o igual a starts_at', () => {
    const c = example();
    c.discount_codes[0].starts_at = '2027-12-31';
    expect(issuesOf(c).some((i) => i.path === 'discount_codes.0.ends_at')).toBe(true);
  });

  it('rechaza reservation_minutes 29 y 121', () => {
    for (const value of [29, 121]) {
      const c = example();
      c.reservation_minutes = value;
      expect(issuesOf(c).some((i) => i.path === 'reservation_minutes')).toBe(true);
    }
  });

  it('rechaza un código de descuento en minúsculas', () => {
    const c = example();
    c.discount_codes[0].code = 'bienvenida10';
    expect(issuesOf(c).some((i) => i.path === 'discount_codes.0.code')).toBe(true);
  });
});

describe('checkout: en el archivo completo', () => {
  const petcare = () => parse(readFileSync('content/petcare.yaml', 'utf8')) as Record<string, any>;

  it('el archivo de la demo es válido', () => {
    const result = parseContent(petcare(), env);
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it('falla si sections.carrito.href no es nulo y no hay bloque checkout:', () => {
    const content = petcare();
    content.sections.find((s: any) => s.key === 'carrito').href = '/carrito';
    delete content.checkout;
    const result = parseContent(content, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.path === 'checkout')).toBe(true);
  });

  it('con el carrito activo exige la página legal condiciones-venta', () => {
    const content = petcare();
    content.sections.find((s: any) => s.key === 'carrito').href = '/carrito';
    content.legal_pages = content.legal_pages.filter((p: any) => p.kind !== 'condiciones-venta');
    const result = parseContent(content, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.message.includes('condiciones-venta'))).toBe(true);
  });

  it('indica la ruta checkout.<campo> en el error', () => {
    const content = petcare();
    content.checkout = { ...example(), reservation_minutes: 10 };
    const result = parseContent(content, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.path === 'checkout.reservation_minutes')).toBe(true);
  });
});
