# Quickstart: validar la feature 002

## Preparación

```bash
docker compose up -d                                  # PostgreSQL (5434) y el correo falso
npm install                                           # añade @node-rs/argon2
npm run db:migrate                                    # aplica 0001_client_accounts
npm run content:load -- --file content/petcare.yaml   # carga especies y cuenta.href=/mi-cuenta
npm run email:fake &                                  # bandeja falsa (EMAIL_PROVIDER=fake)
npm run dev
```

## Recorridos manuales

Hay que repetirlos con JavaScript desactivado.

1. **Registro y verificación (US1)**:
   - En `/crear-cuenta`, envía primero con contraseñas distintas: el error aparece junto a
     "Repetir contraseña" y el resto de datos se conserva.
   - Corrígelo y envía: llegas a "Revisa tu correo".
   - Intenta entrar en `/iniciar-sesion`: aparece "verifica tu correo".
   - `npm run email:fake:list` muestra el enlace. Ábrelo y pulsa "Confirmar mi correo": llegas a
     iniciar sesión con el correo ya escrito.
2. **Correo duplicado**: regístrate otra vez con el mismo correo. Ves la misma página y llega un
   `account_exists`.
3. **Sesión (US2)**:
   - Entra sin "Recordarme", cierra el navegador y vuelve: se pide iniciar sesión.
   - Entra con "Recordarme": la cookie `pc_session` tiene `Max-Age` de 30 días.
   - "Cerrar sesión", y luego "atrás": se pide iniciar sesión.
4. **Bloqueo**: 6 contraseñas incorrectas seguidas. El sexto intento muestra el mensaje de
   bloqueo con los minutos.
5. **Mascotas (US3)**:
   - Con la lista vacía aparece el estado vacío.
   - Añade una mascota nacida hace 4 años y 3 meses (se ve "4 años") y otra nacida hace 5 meses
     ("5 meses").
   - Edita una y elimina otra (con la página de confirmación).
6. **Acceso ajeno**: con el cliente B, abre `/mi-cuenta/mascotas/<id de A>/editar`. Da 404.
7. **Recuperación (US5)**:
   - Pide el enlace, usa el del correo y cambia la contraseña.
   - La anterior ya no vale, y llega un `password_changed`.
   - Abre de nuevo el mismo enlace: aparece la página de enlace caducado.
8. **Datos y preferencia (US6 y US8)**: cambia el teléfono, la dirección y la preferencia, y
   comprueba que persisten tras cerrar y abrir sesión.
9. **Descarga y eliminación (US7)**:
   - "Descargar mis datos" baja un JSON con el formato de
     [contracts/export-format.md](contracts/export-format.md).
   - Elimina la cuenta con la contraseña: vuelves a la portada, llega un `account_deleted`, el
     inicio de sesión falla con el mensaje genérico y puedes registrarte de nuevo con ese correo.

## Pruebas automáticas

```bash
npm run lint              # incluye check:design
npm test                  # password-policy, pet-age, account-schemas, rate-limit, export, plantillas
npm run test:integration  # registro, verificación, bloqueo, recuperación, autorización, exportación, borrado y purgas
npm run test:e2e          # us1–us8, axe en las rutas nuevas, account-no-cache y proyecto no-js
```

Resultado esperado: todo en verde. Los tests de autorización (SC-003) y los de caché tras cerrar
sesión (SC-004) son bloqueantes en la CI, según el principio III.

## Purgas

Con `npm run retention:purge`, en una base de datos con una cuenta sin verificar de hace 8 días,
la cuenta desaparece, y los tokens y sesiones caducados también (A13).
