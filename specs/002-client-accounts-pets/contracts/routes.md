# Contrato: rutas

Todas las rutas son dinámicas, llevan `robots: noindex` y responden con
`Cache-Control: private, no-store`. Se pinta en el servidor y todo funciona sin JavaScript.

## Públicas (sin sesión)

| Ruta | GET | POST (Server Action) | Con sesión vigente |
|---|---|---|---|
| `/crear-cuenta` | Formulario de registro | `register` → 303 a `/crear-cuenta/revisa-tu-correo` | redirige a `/mi-cuenta` |
| `/crear-cuenta/revisa-tu-correo` | "Revisa tu correo" con la opción de reenvío (formulario con el correo) | `resendVerification` → la misma página con `?aviso=enlace-reenviado` | se muestra igual |
| `/verificar-correo?token=…` | Token válido: botón "Confirmar mi correo". Cuenta ya verificada: aviso y enlace a iniciar sesión. Token no válido: página de enlace caducado con el formulario de reenvío | `verifyEmail` → 303 a `/iniciar-sesion?aviso=correo-verificado` y cookie `pc_login_hint` | se muestra igual |
| `/iniciar-sesion?return_to=…` | Formulario de acceso con "Recordarme" y enlaces a recuperar contraseña y crear cuenta | `login` → 303 a `return_to` si es seguro o a `/mi-cuenta` | redirige a `/mi-cuenta` |
| `/recuperar-contrasena` | Formulario con el correo | `requestReset` → 303 a `/recuperar-contrasena/enviado` | se muestra igual |
| `/recuperar-contrasena/enviado` | Mensaje neutro (FR-018) | — | — |
| `/restablecer-contrasena?token=…` | Token válido: nueva contraseña y su repetición. Token no válido: página de enlace caducado con un enlace para pedir otro | `resetPassword` → 303 a `/iniciar-sesion?aviso=contrasena-restablecida` | se cierra la sesión actual (FR-016) |

## Privadas (`requireCustomer()`)

Sin sesión vigente, todas redirigen con 307 a `/iniciar-sesion?return_to=<ruta>`.

| Ruta | GET | POST | Redirección tras el POST |
|---|---|---|---|
| `/mi-cuenta` | Resumen: saludo, mascotas y accesos | — | — |
| `/mi-cuenta/mascotas` | Lista ordenada por nombre, o estado vacío | — | — |
| `/mi-cuenta/mascotas/nueva` | Formulario (o el aviso del límite si ya hay 30) | `createPet` | `/mi-cuenta/mascotas?aviso=mascota-anadida` |
| `/mi-cuenta/mascotas/[id]/editar` | Formulario con los datos. Si es ajena o no existe, 404 | `updatePet` | `/mi-cuenta/mascotas?aviso=mascota-guardada` |
| `/mi-cuenta/mascotas/[id]/eliminar` | Confirmación que nombra a la mascota. Si es ajena o no existe, 404 | `deletePet` | `/mi-cuenta/mascotas?aviso=mascota-eliminada` |
| `/mi-cuenta/datos` | Tres formularios: datos personales, preferencia y contraseña. Correo en solo lectura. Botón para descargar los datos y enlace a eliminar la cuenta | `updateProfile`, `updateMarketing`, `changePassword` | `/mi-cuenta/datos?aviso=datos-guardados` o `?aviso=contrasena-cambiada` |
| `/mi-cuenta/eliminar-cuenta` | Explica qué se borra y pide la contraseña | `deleteAccount` | `/?aviso=cuenta-eliminada` (sin cookie) |
| (en todas) | — | `logout` (botón del menú) | `/?aviso=sesion-cerrada` |
| `POST /api/account/export` | — | Comprueba Origin y Sec-Fetch-Site, y la sesión | 200 `application/json` con `attachment`. Sin sesión, 303 a iniciar sesión |

`/mi-cuenta/citas` y `/mi-cuenta/pedidos` **no existen**. El menú del área y "Pedir cita" usan
`sectionHref('reservas' | 'tienda')`, de modo que siguen en "Próximamente" hasta que lleguen sus
features.

## Cabecera

"Mi cuenta" usa `sectionHref('cuenta')`, que pasa a `/mi-cuenta` (por el cambio del YAML). Sin
sesión, `/mi-cuenta` redirige a iniciar sesión (FR-017).

## Otros cambios

- `robots.ts`: `disallow` pasa a `['/api/', '/mi-cuenta']`.
- `sitemap.ts`: no incluye ninguna de estas rutas.
- La portada muestra el `?aviso=` de cierre de sesión y de cuenta eliminada.
