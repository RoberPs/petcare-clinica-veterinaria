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

/**
 * Código de error apto para los logs: nunca el mensaje de un error ajeno, porque los de Drizzle y
 * PostgreSQL incluyen el SQL y los parámetros (correo, teléfono, mensaje…). Se conservan los
 * códigos propios en snake_case (`cart_gone`, `payment_not_found`, `402`) y, del resto, solo el
 * nombre del error y el SQLSTATE o código de sistema.
 */
export function logErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  if (/^[a-z0-9_]{1,60}$/.test(error.message)) return error.message;
  const withCode = error as { code?: unknown; cause?: { code?: unknown } };
  const code = withCode.cause?.code ?? withCode.code;
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code) ? `${error.name}:${code}` : error.name;
}
