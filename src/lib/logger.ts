import pino from 'pino';

// Logs en JSON y sin datos personales: se redactan el correo, el nombre, el teléfono y el mensaje.
const personalFields = ['email', 'name', 'phone', 'message', 'nombre', 'telefono', 'mensaje'];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { app: 'petcare-web' },
  redact: {
    paths: [...personalFields, ...personalFields.map((f) => `*.${f}`)],
    censor: '[redactado]',
  },
});
