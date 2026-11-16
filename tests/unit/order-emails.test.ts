import { describe, expect, it } from 'vitest';
import { orderCancelled, refundSentence } from '@/email/templates/order-cancelled';
import { orderClinic } from '@/email/templates/order-clinic';
import type { OrderEmailContext, OrderEmailData } from '@/email/templates/order-common';
import { orderConfirmed } from '@/email/templates/order-confirmed';
import { orderReceived } from '@/email/templates/order-received';

const ctx: OrderEmailContext = {
  clinicName: 'PetCare',
  demoBannerEnabled: true,
  siteUrl: 'https://petcare.example',
  clinicAddress: 'Calle de Prueba 1, 28000 Madrid',
  clinicPhone: '600 00 00 00',
  inboxEmail: 'buzon@example.test',
  clinicHours: ['Lunes a viernes: 09:30–20:00'],
};

const data: OrderEmailData = {
  number: 'PC-000123',
  // 13/11/2026 a las 10:05 en Madrid (UTC+1).
  createdAt: new Date('2026-11-13T09:05:00Z'),
  firstName: 'Ana <b>Prueba</b>',
  lastName: 'López',
  email: 'ana@example.test',
  status: 'paid',
  refundStatus: 'none',
  items: [
    { name: 'Pienso & <i>co</i>', quantity: 2, amountCents: 8500 },
    { name: 'Cepillo', quantity: 1, amountCents: 1050 },
  ],
  subtotalCents: 9550,
  discountCents: 955,
  discountCode: 'BIENVENIDA10',
  shippingCents: 0,
  totalCents: 8595,
  vatCents: 1492,
  shippingKind: 'home_delivery',
  shippingName: 'Envío a domicilio',
  addressLine: 'Calle Falsa 2',
  postalCode: '28001',
  city: 'Madrid',
  paymentMethod: 'card',
  pickupDeadline: null,
  cancelReason: null,
  link: 'https://petcare.example/mi-cuenta/pedidos/PC-000123',
  guestLinkDays: null,
};

// formatEur separa el símbolo con un espacio duro; aquí se compara con espacios normales.
const sp = <T extends { text: string; html: string }>(e: T): T => ({ ...e, text: e.text.replace(/ /g, ' ') });

function expectSafe(e: { html: string; text: string }) {
  expect(e.html).not.toContain('<b>Prueba</b>');
  expect(e.html).not.toContain('<i>co</i>');
  expect(e.html).toContain('Pienso &amp; &lt;i&gt;co&lt;/i&gt;');
  expect(e.text).not.toContain('<p>');
}

describe('order_confirmed', () => {
  it('asunto, fecha en Madrid, líneas y totales de la copia del pedido', () => {
    const e = sp(orderConfirmed(ctx, data));
    expect(e.to.email).toBe('ana@example.test');
    expect(e.subject).toBe('Pedido PC-000123 confirmado');
    for (const part of [
      'PC-000123',
      '13/11/2026 10:05',
      'Pagado',
      'Pienso & <i>co</i> × 2',
      '85,00 €',
      'Subtotal',
      '95,50 €',
      'Descuento (BIENVENIDA10)',
      '−9,55 €',
      'Gratis',
      '85,95 €',
      'IVA incluido',
      '14,92 €',
      'Calle Falsa 2, 28001 Madrid',
      'Tarjeta',
      'https://petcare.example/mi-cuenta/pedidos/PC-000123',
      'Tienda de demostración: no se ha cobrado nada y no se enviará ningún producto.',
    ]) {
      expect(e.text).toContain(part);
    }
    expectSafe(e);
  });

  it('sin descuento no hay fila de descuento; envío con coste en euros', () => {
    const e = sp(orderConfirmed(ctx, { ...data, discountCents: 0, discountCode: null, shippingCents: 495 }));
    expect(e.text).not.toContain('Descuento');
    expect(e.text).toContain('4,95 €');
    expect(e.text).not.toContain('Gratis');
  });

  it('recogida: dirección y horario de la clínica, sin dirección del comprador', () => {
    const e = sp(orderConfirmed(ctx, { ...data, shippingKind: 'clinic_pickup', shippingName: 'Recogida en la clínica', addressLine: null, postalCode: null, city: null }));
    expect(e.text).toContain('Calle de Prueba 1, 28000 Madrid');
    expect(e.text).toContain('Lunes a viernes: 09:30–20:00');
    expect(e.text).not.toContain('Calle Falsa');
  });

  it('invitado: avisa de la validez del enlace privado', () => {
    const e = sp(orderConfirmed(ctx, { ...data, link: 'https://petcare.example/pedido/tok', guestLinkDays: 90 }));
    expect(e.text).toContain('https://petcare.example/pedido/tok');
    expect(e.text).toContain('vale 90 días');
  });
});

describe('order_received', () => {
  it('pago en clínica pendiente con la fecha límite de recogida', () => {
    const e = sp(orderReceived(ctx, {
      ...data,
      status: 'pending_payment',
      paymentMethod: 'in_clinic',
      shippingKind: 'clinic_pickup',
      shippingName: 'Recogida en la clínica',
      addressLine: null,
      postalCode: null,
      city: null,
      // Fin del día 20/11/2026 en Madrid.
      pickupDeadline: new Date('2026-11-20T23:00:00Z'),
    }));
    expect(e.subject).toBe('Pedido PC-000123 recibido: pago en la clínica');
    expect(e.text).toContain('Pago en la clínica (pendiente)');
    expect(e.text).toContain('20 de noviembre de 2026');
    expect(e.text).toContain('Calle de Prueba 1, 28000 Madrid');
    expectSafe(e);
  });
});

describe('order_cancelled', () => {
  it('motivo en lenguaje claro y sin reembolso si no hubo pago', () => {
    const e = sp(orderCancelled(ctx, { ...data, status: 'cancelled', cancelReason: 'expired', refundStatus: 'none' }));
    expect(e.subject).toBe('Pedido PC-000123 cancelado');
    expect(e.text).toContain('Venció el plazo para completar el pago o la recogida.');
    expect(e.text).not.toContain('devuelto');
    expect(e.text).not.toContain('tramitando');
    expect(e.text).toContain('600 00 00 00');
    expectSafe(e);
  });

  it('reembolsado: "Te hemos devuelto…"', () => {
    const e = sp(orderCancelled(ctx, { ...data, status: 'cancelled', cancelReason: 'clinic', refundStatus: 'refunded' }));
    expect(e.text).toContain('Te hemos devuelto 85,95 € en el mismo medio de pago (simulación).');
    expect(e.text).toContain('Reembolsado');
  });

  it('reembolso pendiente: "Estamos tramitando la devolución…"', () => {
    const e = sp(orderCancelled(ctx, { ...data, status: 'cancelled', cancelReason: 'stock_unavailable', refundStatus: 'pending' }));
    expect(e.text).toContain('Estamos tramitando la devolución de 85,95 € en el mismo medio de pago (simulación).');
    expect(e.text).toContain('No quedaban unidades suficientes');
  });

  it('refundSentence devuelve null sin pago', () => {
    expect(refundSentence({ refundStatus: 'none', totalCents: 100 })).toBeNull();
  });
});

describe('clinic_order', () => {
  it('a la clínica, con comprador, dirección, totales y sin enlace de gestión', () => {
    const e = sp(orderClinic(ctx, data));
    expect(e.to.email).toBe('buzon@example.test');
    expect(e.replyTo?.email).toBe('ana@example.test');
    expect(e.subject).toBe('Nuevo pedido PC-000123');
    for (const part of ['Ana <b>Prueba</b> López', 'ana@example.test', 'Calle Falsa 2, 28001 Madrid', '85,95 €', 'cli/orders.mjs show PC-000123']) {
      expect(e.text).toContain(part);
    }
    expect(e.text).not.toContain('/mi-cuenta/pedidos');
    expectSafe(e);
  });

  it('recogida con pago en clínica', () => {
    const e = sp(orderClinic(ctx, { ...data, paymentMethod: 'in_clinic', status: 'pending_payment', shippingKind: 'clinic_pickup', shippingName: 'Recogida', addressLine: null, postalCode: null, city: null }));
    expect(e.text).toContain('Recogida en la clínica');
    expect(e.text).toContain('Pago en la clínica (pendiente)');
  });
});
