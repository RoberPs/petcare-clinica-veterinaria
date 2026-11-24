import { describe, expect, it } from 'vitest';
import type { OrderEmailContext, OrderEmailData } from '@/email/templates/order-common';
import { orderStatus } from '@/email/templates/order-status';

// Correo order_status (feature 008, contracts/emails.md): asunto, variantes por estado, combinado,
// sin el motivo interno, HTML escapado y versión en texto.

const ctx: OrderEmailContext = {
  clinicName: 'PetCare',
  demoBannerEnabled: true,
  siteUrl: 'https://petcare.example',
  clinicAddress: 'Calle de Prueba 1, 28000 Madrid',
  clinicPhone: '600 00 00 00',
  inboxEmail: 'buzon@example.test',
  clinicHours: ['Lunes a viernes: 09:30–20:00', 'Sábados: 10:00–14:00'],
};

const base: OrderEmailData = {
  number: 'PED-000042',
  createdAt: new Date('2026-11-13T09:05:00Z'),
  firstName: 'Ana <b>Prueba</b>',
  lastName: 'López',
  email: 'ana@example.test',
  status: 'shipped',
  refundStatus: 'none',
  items: [{ name: 'Pienso & <i>co</i>', quantity: 2, amountCents: 8500 }],
  subtotalCents: 8500,
  discountCents: 0,
  discountCode: null,
  shippingCents: 0,
  totalCents: 8500,
  vatCents: 1475,
  shippingKind: 'home_delivery',
  shippingName: 'Envío a domicilio',
  addressLine: 'Calle Falsa 2',
  postalCode: '28001',
  city: 'Madrid',
  paymentMethod: 'card',
  pickupDeadline: null,
  cancelReason: null,
  link: 'https://petcare.example/mi-cuenta/pedidos/PED-000042',
  guestLinkDays: null,
};
const pickup: OrderEmailData = {
  ...base,
  shippingKind: 'clinic_pickup',
  shippingName: 'Recogida en la clínica',
  addressLine: null,
  postalCode: null,
  city: null,
  paymentMethod: 'in_clinic',
  // Hasta el 20/11/2026 incluido (Madrid).
  pickupDeadline: new Date('2026-11-20T23:00:00Z'),
};

const plain = (s: string) => s.replace(/ /g, ' ');

describe('order_status', () => {
  it('asunto con el número y el estado', () => {
    expect(orderStatus(ctx, base, 'shipped').subject).toBe('Pedido PED-000042: enviado');
    expect(orderStatus(ctx, base, 'preparing').subject).toBe('Pedido PED-000042: en preparación');
    expect(orderStatus(ctx, pickup, 'ready_for_pickup').subject).toBe('Pedido PED-000042: listo para recoger');
    expect(orderStatus(ctx, pickup, 'paid').subject).toBe('Pedido PED-000042: pago registrado');
    expect(orderStatus(ctx, base, 'delivered').subject).toBe('Pedido PED-000042: entregado');
    expect(orderStatus(ctx, pickup, 'delivered', { combined: true }).subject).toBe('Pedido PED-000042: pagado y entregado');
  });

  it('preparing', () => {
    expect(orderStatus(ctx, base, 'preparing').text).toContain('Estamos preparando tu pedido.');
  });

  it('shipped: plazo de entrega y dirección', () => {
    const e = orderStatus(ctx, base, 'shipped', { shippingText: '24-48 h' });
    expect(e.text).toContain('Tu pedido va de camino.');
    expect(e.text).toContain('Plazo de entrega: 24-48 h.');
    expect(e.text).toContain('Calle Falsa 2, 28001 Madrid');
  });

  it('ready_for_pickup: dirección, horario de la clínica y plazo de recogida', () => {
    const e = orderStatus(ctx, pickup, 'ready_for_pickup');
    expect(e.text).toContain('listo para recoger');
    expect(e.text).toContain('Calle de Prueba 1, 28000 Madrid');
    expect(e.text).toContain('Lunes a viernes: 09:30–20:00 · Sábados: 10:00–14:00');
    expect(e.text).toContain('20 de noviembre de 2026');
  });

  it('paid (pago en clínica) y delivered, también combinado', () => {
    const paid = orderStatus(ctx, pickup, 'paid');
    expect(paid.text).toContain('Hemos registrado tu pago en la clínica.');
    expect(paid.text).toContain('Recuerda pasar a recoger');
    expect(orderStatus(ctx, base, 'delivered').text).toContain('Pedido entregado.');
    expect(orderStatus(ctx, pickup, 'delivered', { combined: true }).text).toContain('Pago confirmado y pedido entregado.');
  });

  it('líneas, total, enlace y aviso de demostración; nunca el motivo interno', () => {
    const e = orderStatus(ctx, { ...base, cancelReason: 'clinic' }, 'shipped');
    const text = plain(e.text);
    expect(text).toContain('85,00 €');
    expect(text).toContain('https://petcare.example/mi-cuenta/pedidos/PED-000042');
    expect(text).toContain('Tienda de demostración');
    expect(text).not.toContain('Motivo');
    expect(text).not.toContain('canceló');
  });

  it('HTML escapado y versión en texto', () => {
    const e = orderStatus(ctx, base, 'shipped');
    expect(e.html).not.toContain('<b>Prueba</b>');
    expect(e.html).toContain('Pienso &amp; &lt;i&gt;co&lt;/i&gt;');
    expect(e.text).not.toContain('<p>');
    expect(e.to.email).toBe('ana@example.test');
  });
});
