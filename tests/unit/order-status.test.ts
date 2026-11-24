import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  ORDER_STATUSES,
  reservationEffect,
  statusLabel,
  type OrderActor,
  type OrderFacts,
  type OrderStatus,
} from '@/domain/order-status';

const card: OrderFacts = { status: 'pending_payment', paymentMethod: 'card', shippingKind: 'home_delivery', cancelReason: null };
const clinicPay: OrderFacts = {
  status: 'pending_payment',
  paymentMethod: 'in_clinic',
  shippingKind: 'clinic_pickup',
  cancelReason: null,
};
const pickupCard: OrderFacts = { ...card, shippingKind: 'clinic_pickup' };
const at = (o: OrderFacts, status: OrderStatus, cancelReason: OrderFacts['cancelReason'] = null): OrderFacts => ({
  ...o,
  status,
  cancelReason,
});

describe('canTransition: transiciones válidas', () => {
  const valid: [string, OrderFacts, OrderStatus, OrderActor][] = [
    ['tarjeta pendiente → pagado (pasarela)', card, 'paid', 'gateway'],
    ['en clínica pendiente → entregado (clínica)', clinicPay, 'delivered', 'clinic'],
    ['pendiente → cancelado (cliente)', card, 'cancelled', 'customer'],
    ['pendiente → cancelado (sistema)', card, 'cancelled', 'system'],
    ['pendiente → cancelado (clínica)', clinicPay, 'cancelled', 'clinic'],
    ['cancelado por caducidad → pagado (pago tardío)', at(card, 'cancelled', 'expired'), 'paid', 'gateway'],
    ['pagado → en preparación', at(card, 'paid'), 'preparing', 'clinic'],
    ['pagado → enviado (domicilio)', at(card, 'paid'), 'shipped', 'clinic'],
    ['en preparación → enviado (domicilio)', at(card, 'preparing'), 'shipped', 'clinic'],
    ['pagado → listo para recoger (recogida)', at(pickupCard, 'paid'), 'ready_for_pickup', 'clinic'],
    ['en preparación → listo para recoger', at(pickupCard, 'preparing'), 'ready_for_pickup', 'clinic'],
    ['enviado → entregado', at(card, 'shipped'), 'delivered', 'clinic'],
    ['listo para recoger → entregado', at(pickupCard, 'ready_for_pickup'), 'delivered', 'clinic'],
    ['pagado → cancelado (clínica)', at(card, 'paid'), 'cancelled', 'clinic'],
    ['en preparación → cancelado (clínica)', at(card, 'preparing'), 'cancelled', 'clinic'],
    ['listo para recoger → cancelado (clínica)', at(pickupCard, 'ready_for_pickup'), 'cancelled', 'clinic'],
  ];
  it.each(valid)('%s', (_name, order, to, actor) => {
    expect(canTransition(order, to, actor)).toBe(true);
  });
});

describe('canTransition: transiciones no válidas', () => {
  const invalid: [string, OrderFacts, OrderStatus, OrderActor][] = [
    ['entregado → enviado', at(card, 'delivered'), 'shipped', 'clinic'],
    ['pagado → cancelado por el cliente', at(card, 'paid'), 'cancelled', 'customer'],
    ['enviado en recogida', at(pickupCard, 'paid'), 'shipped', 'clinic'],
    ['listo para recoger con domicilio', at(card, 'paid'), 'ready_for_pickup', 'clinic'],
    ['tarjeta pendiente → entregado', card, 'delivered', 'clinic'],
    ['en clínica pendiente → pagado por la pasarela', clinicPay, 'paid', 'gateway'],
    ['tarjeta pendiente → pagado por la clínica', card, 'paid', 'clinic'],
    ['cancelado por el cliente → pagado', at(card, 'cancelled', 'customer'), 'paid', 'gateway'],
    ['cancelado → cancelado', at(card, 'cancelled', 'expired'), 'cancelled', 'system'],
    ['enviado → cancelado', at(card, 'shipped'), 'cancelled', 'clinic'],
    ['entregado → cancelado', at(card, 'delivered'), 'cancelled', 'clinic'],
    ['pendiente → en preparación', card, 'preparing', 'clinic'],
    ['pagado → pagado', at(card, 'paid'), 'paid', 'gateway'],
    ['pendiente → pendiente', card, 'pending_payment', 'customer'],
  ];
  it.each(invalid)('%s', (_name, order, to, actor) => {
    expect(canTransition(order, to, actor)).toBe(false);
  });

  it('ningún estado vuelve a "Pendiente de pago"', () => {
    for (const from of ORDER_STATUSES) {
      for (const actor of ['customer', 'system', 'clinic', 'gateway'] as const) {
        expect(canTransition(at(card, from, from === 'cancelled' ? 'expired' : null), 'pending_payment', actor)).toBe(false);
      }
    }
  });
});

describe('reservationEffect', () => {
  it('held → committed al pagar o entregar en clínica', () => {
    expect(reservationEffect('held', 'paid')).toBe('committed');
    expect(reservationEffect('held', 'delivered')).toBe('committed');
  });

  it('held o committed → released al cancelar', () => {
    expect(reservationEffect('held', 'cancelled')).toBe('released');
    expect(reservationEffect('committed', 'cancelled')).toBe('released');
  });

  it('released → committed en el pago tardío', () => {
    expect(reservationEffect('released', 'paid')).toBe('committed');
  });

  it('sin cambio en el resto', () => {
    expect(reservationEffect('committed', 'shipped')).toBeNull();
    expect(reservationEffect('committed', 'delivered')).toBeNull();
    expect(reservationEffect('released', 'cancelled')).toBeNull();
  });
});

describe('statusLabel', () => {
  it('etiquetas en español', () => {
    expect(statusLabel('pending_payment')).toBe('Pendiente de pago');
    expect(statusLabel('paid')).toBe('Pagado');
    expect(statusLabel('preparing')).toBe('En preparación');
    expect(statusLabel('shipped')).toBe('Enviado');
    expect(statusLabel('ready_for_pickup')).toBe('Listo para recoger');
    expect(statusLabel('delivered')).toBe('Entregado');
    expect(statusLabel('cancelled')).toBe('Cancelado');
  });

  it('con la marca "· Reembolsado"', () => {
    expect(statusLabel('cancelled', 'refunded')).toBe('Cancelado · Reembolsado');
    expect(statusLabel('cancelled', 'pending')).toBe('Cancelado');
  });
});

// ---------- Feature 008: lo que ofrece el panel (G7) y el pago en clínica (US5) ----------

describe('allowedTransitions (clínica)', () => {
  const NOW = new Date('2026-11-20T10:00:00Z');
  const pickupDeadline = new Date('2026-11-25T23:00:00Z');
  const clinicPayLive: OrderFacts = { ...clinicPay, pickupDeadline };

  it('ofrece, por estado y tipo de envío, solo las transiciones de la tabla', () => {
    expect(allowedTransitions(card, 'clinic', NOW)).toEqual(['cancelled']);
    expect(allowedTransitions(at(card, 'paid'), 'clinic', NOW)).toEqual(['preparing', 'shipped', 'cancelled']);
    expect(allowedTransitions(at(card, 'preparing'), 'clinic', NOW)).toEqual(['shipped', 'cancelled']);
    expect(allowedTransitions(at(pickupCard, 'paid'), 'clinic', NOW)).toEqual(['preparing', 'ready_for_pickup', 'cancelled']);
    expect(allowedTransitions(at(pickupCard, 'preparing'), 'clinic', NOW)).toEqual(['ready_for_pickup', 'cancelled']);
    expect(allowedTransitions(at(pickupCard, 'ready_for_pickup'), 'clinic', NOW)).toEqual(['delivered', 'cancelled']);
    expect(allowedTransitions(at(card, 'shipped'), 'clinic', NOW)).toEqual(['delivered']);
    expect(allowedTransitions(at(card, 'delivered'), 'clinic', NOW)).toEqual([]);
    expect(allowedTransitions(at(card, 'cancelled', 'clinic'), 'clinic', NOW)).toEqual([]);
  });

  it('nunca ofrece cancelar un pedido enviado o entregado', () => {
    for (const o of [card, pickupCard, clinicPayLive]) {
      expect(allowedTransitions(at(o, 'shipped'), 'clinic', NOW)).not.toContain('cancelled');
      expect(allowedTransitions(at(o, 'delivered'), 'clinic', NOW)).not.toContain('cancelled');
    }
  });

  it('el pago en clínica pendiente y vigente admite pagado, entregado o cancelado', () => {
    expect(allowedTransitions(clinicPayLive, 'clinic', NOW)).toEqual(['paid', 'delivered', 'cancelled']);
  });

  it('el pago en clínica ya pagado se puede entregar en el mostrador', () => {
    expect(allowedTransitions(at(clinicPayLive, 'paid'), 'clinic', NOW)).toEqual(['preparing', 'ready_for_pickup', 'delivered', 'cancelled']);
  });
});

describe('pending_payment → paid por la clínica (US5)', () => {
  const NOW = new Date('2026-11-20T10:00:00Z');
  it('solo con pago en clínica y el plazo de recogida vigente', () => {
    expect(canTransition({ ...clinicPay, pickupDeadline: new Date(NOW.getTime() + 60_000) }, 'paid', 'clinic', NOW)).toBe(true);
    expect(canTransition({ ...clinicPay, pickupDeadline: new Date(NOW.getTime() - 1) }, 'paid', 'clinic', NOW)).toBe(false);
    expect(canTransition({ ...clinicPay, pickupDeadline: NOW }, 'paid', 'clinic', NOW)).toBe(false);
    expect(canTransition({ ...clinicPay, pickupDeadline: null }, 'paid', 'clinic', NOW)).toBe(false);
  });
  it('nunca con tarjeta', () => {
    expect(canTransition({ ...card, pickupDeadline: new Date(NOW.getTime() + 60_000) }, 'paid', 'clinic', NOW)).toBe(false);
    expect(canTransition({ ...pickupCard, pickupDeadline: new Date(NOW.getTime() + 60_000) }, 'paid', 'clinic', NOW)).toBe(false);
  });
});
