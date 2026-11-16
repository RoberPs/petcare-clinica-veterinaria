# Contrato: exportación de la cuenta, versión 2 (amplía la de la 002 y la 003)

`format_version` pasa de 1 a 2. Se añade la sección `orders`. El resto no cambia.

```json
{
  "format_version": 2,
  "orders": [
    {
      "number": "PC-000123",
      "created_at": "2026-11-12T10:15:00+01:00",
      "status": "Pagado",
      "refunded": false,
      "payment_method": "Tarjeta",
      "shipping": {
        "method": "Envío a domicilio",
        "first_name": "…", "last_name": "…",
        "address_line": "…", "postal_code": "28001", "city": "…"
      },
      "items": [
        { "name": "…", "quantity": 2, "unit_price": "9,90 €", "total": "19,80 €", "vat_rate": 21 }
      ],
      "discount": { "code": "BIENVENIDA10", "amount": "1,98 €" },
      "subtotal": "19,80 €",
      "shipping_cost": "0,00 €",
      "total": "17,82 €",
      "vat_included": "3,09 €"
    }
  ]
}
```

Solo incluye los pedidos con `customer_id` igual al del cliente. Los de invitado con el mismo
correo no se incluyen (D18).
