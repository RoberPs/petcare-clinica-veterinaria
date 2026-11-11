import { PASSWORD_MAX, PASSWORD_MIN } from './account-fields';
import { COMMON_PASSWORDS } from './common-passwords';

// Política de contraseñas (A7, NIST SP 800-63B): solo longitud, lista de contraseñas comunes y que no
// contenga el correo. Sin reglas de composición.

export { PASSWORD_MAX, PASSWORD_MIN };
/** La parte local del correo solo se busca si tiene al menos esta longitud (evita falsos positivos con "a@…"). */
const MIN_LOCAL_PART = 3;

export type PasswordCheck = 'ok' | 'too_short' | 'too_long' | 'common' | 'contains_email';

export const PASSWORD_MESSAGES: Record<Exclude<PasswordCheck, 'ok'>, string> = {
  too_short: `Usa al menos ${PASSWORD_MIN} caracteres.`,
  too_long: `Usa como máximo ${PASSWORD_MAX} caracteres.`,
  common: 'Esa contraseña es muy común; elige otra.',
  contains_email: 'La contraseña no puede contener tu correo.',
};

/** Longitud en caracteres reales (un emoji cuenta como uno), no en unidades UTF-16. */
const charLength = (value: string) => [...value].length;

export function checkPassword(password: string, email: string | null | undefined): PasswordCheck {
  const length = charLength(password);
  if (length < PASSWORD_MIN) return 'too_short';
  if (length > PASSWORD_MAX) return 'too_long';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'common';
  const local = (email ?? '').trim().toLowerCase().split('@')[0] ?? '';
  if (local.length >= MIN_LOCAL_PART && lower.includes(local)) return 'contains_email';
  return 'ok';
}
