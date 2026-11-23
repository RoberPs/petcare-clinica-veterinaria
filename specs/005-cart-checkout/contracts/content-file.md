# Contrato: bloque `checkout:` del YAML de la clínica

Es obligatorio si `sections.carrito.href` no es nulo, y en ese caso exige también `shop:` (004).
Se valida en `src/content/schema.ts` y se carga en la misma transacción que el resto
(`loadCheckout`).

```yaml
sections:
  - { key: carrito, label: Carrito, href: /carrito }

checkout:
  order_prefix: "PC-"
  reservation_minutes: 30        # 30–120
  pickup_days: 7                 # 1–30
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
      cost: "0,00"               # euros con coma; se guarda en céntimos
      vat_rate: 21
      postal_prefixes: null      # null = toda España; si no, lista de "01".."52"
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
```

## Reglas de validación

La carga se rechaza con la ruta del error y un mensaje en español si:
- al menos un método de pago no está activo, o no hay al menos un método de envío;
- `in_clinic: true` sin un método `clinic_pickup` activo;
- hay más de un `clinic_pickup`;
- los `code` de envío o de descuento están duplicados;
- `postal_prefixes` tiene un prefijo fuera de 01–52;
- un porcentaje está fuera de 1–100 o un importe no es positivo;
- `ends_at ≤ starts_at`;
- `reservation_minutes` está fuera de 30–120.

## Carga

Upsert por `code`. Los métodos y códigos que desaparecen del YAML pasan a `enabled = false`,
nunca se borran (los pedidos los referencian). `uses_count` no se toca.

## Textos legales y de contenido que cambian

- `legal_pages`:
  - se añade `kind: condiciones-venta` (título "Condiciones de venta");
  - se reescriben `terminos`, `privacidad` y `cookies` (cookie `pc_cart`);
- `shop.demo_notice_text`: "Tienda de demostración: los pagos son de prueba y no se envía nada."
- FAQ "recoger-pedido": se enlaza a la tienda.
