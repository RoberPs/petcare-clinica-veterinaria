# Contrato: correos de cuenta

Reglas comunes a todos los correos:

- Se generan en `src/email/templates/` y devuelven `OutgoingEmail` con `html` y `text`. Usan el
  `layoutHtml` y el `escapeHtml` de la 001.
- El remitente es `EMAIL_FROM` y el nombre visible es `clinic.name`.
- Están en español, sin imágenes remotas, y solo llevan el nombre (`first_name`) del cliente.
- Si `clinic.demo_banner_enabled` está activo, llevan al pie el aviso de que es una web de
  demostración.
- Los enlaces son absolutos y se construyen con `SITE_URL`.

| `kind` | Cuándo se envía | Asunto | Contenido | Límite por dirección |
|---|---|---|---|---|
| `verify_email` | Registro nuevo, nuevo intento de registro de una cuenta sin verificar o reenvío | "Confirma tu correo en {clínica}" | Saludo, botón "Confirmar mi correo" con `/verificar-correo?token=…`, "caduca en 24 horas" y "si no has sido tú, ignora este correo" | 3 por hora |
| `account_exists` | Registro con un correo ya verificado | "Ya tienes una cuenta en {clínica}" | Que alguien intentó registrarse con este correo, y los enlaces a iniciar sesión y a recuperar la contraseña | 3 por hora |
| `password_reset` | `requestReset` con una cuenta existente | "Restablece tu contraseña de {clínica}" | Botón con `/restablecer-contrasena?token=…`, "caduca en 1 hora" y "si no lo has pedido, ignora este correo; tu contraseña no cambia" | 3 por hora |
| `password_changed` | `resetPassword` o `changePassword` | "Tu contraseña de {clínica} ha cambiado" | Fecha y hora (Europe/Madrid), y "si no has sido tú, restablécela" con el enlace | sin límite |
| `account_deleted` | `deleteAccount` | "Hemos eliminado tu cuenta de {clínica}" | Confirmación de que se han borrado los datos y las mascotas. No hay enlace para recuperarla | sin límite |

Ningún correo incluye contraseñas, datos de mascotas, teléfono ni dirección. Cada plantilla tiene
tests unitarios de escapado, del aviso de demostración y de que no lleva datos de más.
