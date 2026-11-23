# Quickstart: validar la feature 006

## Preparación

```bash
docker compose up -d                       # PostgreSQL (5434 y 5433) y correo falso
npm run db:migrate                         # aplica 0005_health_tips_newsletter
npm run content:load -- --file content/petcare.yaml
npm run dev
```

`.env` necesita `NEWSLETTER_HASH_KEY` (ver `.env.example`) y `EMAIL_PROVIDER=fake`.

## Validación manual

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Cabecera → "Consejos de salud" | `/consejos` con "Artículos" (12 por página) y "Noticias" (3 + "Ver todas las noticias") |
| 2 | Abrir un artículo | migas, categoría, fecha, preámbulo, imagen, secciones y "Pide cita" → reserva |
| 3 | Abrir el artículo de demo sin imagen | marcador neutro, sin hueco ni imagen rota |
| 4 | Pestaña "Gato" | solo gatos, lista combinada con etiqueta Artículo/Noticia, sin noticias "General" |
| 5 | Buscar "baño" y "BANO" | mismos resultados |
| 6 | Buscar "zzzz" | "No hay resultados para «zzzz»" y "Quitar filtros" |
| 7 | `/consejos/no-existe` | 404 |
| 8 | Portada → boletín con correo nuevo y política aceptada | "Revisa tu correo"; en el correo falso, `newsletter_confirm` con `List-Unsubscribe` |
| 9 | Abrir el enlace → "Confirmar suscripción" | confirmada; reabrir → "ya estaba confirmada" |
| 10 | Repetir el paso 8 con el mismo correo | mismo mensaje en pantalla; ningún correo nuevo |
| 11 | Enlace de baja del correo → "Darme de baja" | baja hecha; reabrir → "Ya no estás suscrito" |
| 12 | Registrar una cuenta con "consejos y novedades" y verificarla | suscripción confirmada sin otro correo |
| 13 | Desactivar la preferencia en "Datos personales" | sale de la lista; constancia de baja creada |
| 14 | Pasos 1–11 con JavaScript desactivado | mismo comportamiento (PRG) |

Para los pasos 9–13 se puede consultar el estado con `psql` contra la base de desarrollo
(puerto 5434):

```sql
select status, source, customer_id is not null as cuenta from newsletter_subscriptions;
select reason, unsubscribed_at from newsletter_unsubscribe_records;
```

## Validación automática

```bash
npm run lint
npm test                    # unitarias de E18
npm run test:integration    # ciclo de suscripción, sincronización, backfill, purgas, búsqueda
npm run test:e2e            # us1–us5, axe y perfil sin JavaScript
npm run test:lighthouse     # + /consejos y un artículo (≥ 90 en móvil)
```

Rutas, acciones y estados: [contracts/routes.md](contracts/routes.md). Datos y transiciones:
[data-model.md](data-model.md).
