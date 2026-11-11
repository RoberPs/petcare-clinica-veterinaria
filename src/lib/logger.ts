import pino from 'pino';

// Logs en JSON y sin datos personales: se redactan el correo, el nombre, el teléfono y el mensaje,
// y (feature 002) los datos de la cuenta, las contraseñas y los tokens, por si alguno se colara.
const contactFields = ['email', 'name', 'phone', 'message', 'nombre', 'telefono', 'mensaje'];
const accountFields = ['first_name', 'last_name', 'password', 'current_password', 'token', 'address_line'];
const personalFields = [...contactFields, ...accountFields];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { app: 'petcare-web' },
  redact: {
    paths: [...personalFields, ...personalFields.map((f) => `*.${f}`)],
    censor: '[redactado]',
  },
});
