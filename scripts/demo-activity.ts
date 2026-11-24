/**
 * Actividad de ejemplo para la demo (npm run demo:seed): citas en la agenda y pedidos en varios
 * estados. Todo pasa por los flujos reales —bookAppointment, confirmOrder, el pago simulado firmado
 * y transitionOrder—, así que respeta los huecos libres, los solapes, el stock y las transiciones.
 * Los nombres y correos son ficticios (example.com). Solo se siembra si aún no hay citas o pedidos.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { and, count, eq, gt } from 'drizzle-orm';
import { getDb } from '../src/db/client';
import { loadBookingConfig } from '../src/db/queries/booking-config';
import { appointments, cartItems, carts, orders, payments, products } from '../src/db/schema';
import { bookAppointment, type BookingCustomer } from '../src/lib/booking/book';
import { slotsForDay } from '../src/lib/booking/slots';
import { confirmOrder } from '../src/lib/checkout/confirm';
import { createSubmissionToken } from '../src/lib/form-token';
import { transitionOrder } from '../src/lib/orders/transition';
import { emitFakeEvent, fakeCompletedEvent } from '../src/lib/payments/fake';

const ZONE = 'Europe/Madrid';
/** Token anti-robots emitido hace 10 s (supera el tiempo mínimo de los formularios). */
const token = () => createSubmissionToken(new Date(Date.now() - 10_000));
/** IP de documentación (RFC 5737) distinta en cada envío: el límite por origen no salta. */
let ipCounter = 0;
const nextIp = () => `192.0.2.${(ipCounter++ % 250) + 1}`;

function formData(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

// ---------- Citas ----------

const GUESTS = [
  { name: 'Marta Gil', pet: 'Simba', species: 'gato', reason: 'Vacuna anual' },
  { name: 'Jorge Ruiz', pet: 'Toby', species: 'perro', reason: 'Cojea de la pata trasera' },
  { name: 'Elena Sanz', pet: 'Nube', species: 'conejo', reason: 'Revisión dental' },
  { name: 'Pablo Ortega', pet: 'Rocky', species: 'perro', reason: 'Primera visita' },
  { name: 'Carmen Vidal', pet: 'Mía', species: 'gato', reason: 'Control de peso' },
  { name: 'Iván Moreno', pet: 'Kiwi', species: 'ave', reason: 'Plumas en mal estado' },
  { name: 'Sara León', pet: 'Bruno', species: 'perro', reason: 'Desparasitación' },
  { name: 'David Romero', pet: 'Lola', species: 'gato', reason: 'Vómitos desde ayer' },
  { name: 'Nuria Castro', pet: 'Coco', species: 'huron', reason: 'Revisión general' },
  { name: 'Álvaro Prieto', pet: 'Max', species: 'perro', reason: 'Alergia en la piel' },
];

/** Hasta `perDay` citas por día laborable en los próximos días, repartidas por la jornada. */
export async function seedAppointments(client: BookingCustomer, clientPetId: string, now: Date): Promise<number> {
  const db = getDb();
  const [existing] = await db.select({ n: count() }).from(appointments);
  if ((existing?.n ?? 0) > 0) return 0;
  const config = await loadBookingConfig();
  if (!config || config.services.length === 0) return 0;

  const today = Temporal.Now.plainDateISO(ZONE);
  let created = 0;
  let guestIndex = 0;
  let clientBookings = 0;
  for (let offset = 0; offset < 8 && guestIndex < GUESTS.length * 2; offset++) {
    const date = today.add({ days: offset }).toString();
    const perDay = offset === 0 ? 3 : 2;
    for (let i = 0; i < perDay; i++) {
      const service = config.services[(offset + i) % config.services.length]!;
      const slots = await slotsForDay(config, { date, service, staffId: null, now });
      if (slots.length === 0) continue;
      // Repartidas por la jornada: primera mitad, segunda mitad…
      const slot = slots[Math.floor(((i + 0.5) * slots.length) / perDay)]!;
      const staff = config.staff.find((s) => s.id === slot.freeStaffIds[(offset + i) % slot.freeStaffIds.length]);
      const base = { servicio: service.slug, profesional: staff?.slug ?? 'sin-preferencia', fecha: date, hora: slot.time, submission: token(), web: '', privacidad: 'on' };

      // El cliente de la demo tiene dos citas (con su mascota); el resto son invitados ficticios.
      const asClient = clientBookings < 2 && (offset === 1 || offset === 4) && i === 0;
      let result;
      if (asClient) {
        result = await bookAppointment(
          formData({ ...base, mascota: clientPetId, telefono: '600 000 001', motivo: offset === 1 ? 'Revisión anual' : 'Vacuna de la rabia' }),
          { ip: nextIp(), now, customer: client },
        );
        if (result.status === 'ok') clientBookings++;
      } else {
        const guest = GUESTS[guestIndex % GUESTS.length]!;
        const n = guestIndex++;
        result = await bookAppointment(
          formData({
            ...base,
            nombre_mascota: guest.pet,
            especie: guest.species,
            nombre: guest.name,
            telefono: `600 000 ${String(100 + n).padStart(3, '0')}`,
            correo: `invitado${n + 1}@example.com`,
            motivo: guest.reason,
          }),
          { ip: nextIp(), now },
        );
      }
      if (result.status === 'ok' && result.appointmentId) created++;
      else if (result.status !== 'ok') console.warn(`Cita de ejemplo no creada (${date} ${slot.time}): ${result.status}`);
    }
  }
  return created;
}

// ---------- Pedidos ----------

type Target = 'pending_payment' | 'paid' | 'preparing' | 'shipped' | 'ready_for_pickup' | 'delivered' | 'cancelled';

interface DemoOrder {
  target: Target;
  pickup: boolean;
  inClinic?: boolean;
  /** Pedido del cliente de la demo (si no, de un invitado ficticio). */
  client?: boolean;
  buyer: { first: string; last: string };
  items: { index: number; quantity: number }[];
}

const ORDERS: DemoOrder[] = [
  { target: 'delivered', pickup: false, client: true, buyer: { first: 'Lucía', last: 'Demo' }, items: [{ index: 0, quantity: 1 }, { index: 3, quantity: 2 }] },
  { target: 'shipped', pickup: false, client: true, buyer: { first: 'Lucía', last: 'Demo' }, items: [{ index: 5, quantity: 1 }] },
  { target: 'paid', pickup: false, buyer: { first: 'Marta', last: 'Gil' }, items: [{ index: 1, quantity: 1 }] },
  { target: 'preparing', pickup: false, buyer: { first: 'Jorge', last: 'Ruiz' }, items: [{ index: 2, quantity: 1 }, { index: 7, quantity: 1 }] },
  { target: 'ready_for_pickup', pickup: true, buyer: { first: 'Elena', last: 'Sanz' }, items: [{ index: 4, quantity: 1 }] },
  { target: 'delivered', pickup: true, buyer: { first: 'Pablo', last: 'Ortega' }, items: [{ index: 6, quantity: 3 }] },
  { target: 'pending_payment', pickup: true, inClinic: true, buyer: { first: 'Carmen', last: 'Vidal' }, items: [{ index: 8, quantity: 1 }] },
  { target: 'cancelled', pickup: false, buyer: { first: 'Iván', last: 'Moreno' }, items: [{ index: 9, quantity: 1 }] },
];

/** Camino normal hasta el estado: pasarela para el pago y clínica para el resto. */
function pathTo(target: Target, pickup: boolean): { to: Target; actor: 'gateway' | 'clinic' }[] {
  const path: { to: Target; actor: 'gateway' | 'clinic' }[] = [];
  if (['preparing', 'shipped', 'ready_for_pickup', 'delivered'].includes(target)) path.push({ to: 'preparing', actor: 'clinic' });
  if (target === 'shipped' || (target === 'delivered' && !pickup)) path.push({ to: 'shipped', actor: 'clinic' });
  if (target === 'ready_for_pickup' || (target === 'delivered' && pickup)) path.push({ to: 'ready_for_pickup', actor: 'clinic' });
  if (target === 'delivered') path.push({ to: 'delivered', actor: 'clinic' });
  return path;
}

export async function seedOrders(client: { id: string; email: string }, now: Date): Promise<number> {
  const db = getDb();
  const [existing] = await db.select({ n: count() }).from(orders);
  if ((existing?.n ?? 0) > 0) return 0;
  const catalog = await db
    .select({ id: products.id, priceCents: products.priceCents })
    .from(products)
    .where(and(eq(products.published, true), gt(products.stock, 5)))
    .orderBy(products.position);
  if (catalog.length < 10) return 0;

  let created = 0;
  for (const [n, demo] of ORDERS.entries()) {
    // Carrito con sus líneas directamente en la base, como si el comprador las hubiera añadido.
    const cartToken = randomBytes(32).toString('base64url');
    // Un carrito principal por cuenta: el del pedido anterior del cliente se sustituye.
    if (demo.client) await db.delete(carts).where(and(eq(carts.customerId, client.id), eq(carts.kind, 'main')));
    const [cart] = await db
      .insert(carts)
      .values(demo.client ? { customerId: client.id } : { tokenHash: createHash('sha256').update(cartToken).digest('hex') })
      .returning({ id: carts.id });
    for (const [i, item] of demo.items.entries()) {
      const product = catalog[item.index]!;
      await db.insert(cartItems).values({
        cartId: cart!.id,
        productId: product.id,
        quantity: item.quantity,
        unitPriceCents: product.priceCents,
        addedAt: new Date(now.getTime() + i),
      });
    }

    const fields: Record<string, string> = {
      token: token(),
      email: demo.client ? client.email : `comprador${n + 1}@example.com`,
      first_name: demo.buyer.first,
      last_name: demo.buyer.last,
      shipping_method: demo.pickup ? 'recogida' : 'domicilio',
      payment_method: demo.inClinic ? 'in_clinic' : 'card',
    };
    if (!demo.pickup) Object.assign(fields, { address_line: 'Calle de la Demostración 2', postal_code: '28001', city: 'Madrid' });
    const result = await confirmOrder(formData(fields), {
      ip: nextIp(),
      now,
      customer: demo.client ? client : null,
      cartToken: demo.client ? null : cartToken,
    });
    if (result.status !== 'ok') {
      console.warn(`Pedido de ejemplo no creado: ${result.status}`);
      continue;
    }
    const orderId = result.orderId;

    if (!demo.inClinic && demo.target !== 'cancelled') {
      // Pago con la pasarela simulada: el mismo aviso firmado que la página /pago-simulado.
      const [payment] = await db
        .select({ sessionId: payments.providerSessionId, amountCents: payments.amountCents })
        .from(payments)
        .where(eq(payments.orderId, orderId));
      await emitFakeEvent(fakeCompletedEvent(payment!.sessionId!, payment!.amountCents, orderId), { now });
    }
    const steps = demo.target === 'cancelled' ? [{ to: 'cancelled' as const, actor: 'clinic' as const }] : pathTo(demo.target, demo.pickup);
    for (const [i, step] of steps.entries()) {
      const at = new Date(now.getTime() + (i + 1) * 1000);
      await db.transaction((tx) => transitionOrder(tx, orderId, step.to, step.actor, { now: at }));
    }
    created++;
  }
  return created;
}
