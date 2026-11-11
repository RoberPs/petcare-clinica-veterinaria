import type { FieldErrors, FormValues } from '@/domain/account-schemas';

// Estado de los formularios de la cuenta (contracts/forms.md). Sin dependencias de servidor: lo
// importan también los componentes de cliente.

export type FormState =
  | { status: 'idle' }
  | { status: 'ok' }
  | { status: 'invalid'; fieldErrors: FieldErrors; values: FormValues }
  | { status: 'rate_limited'; retryMinutes: number }
  | { status: 'expired' }
  | { status: 'error' };

export const IDLE: FormState = { status: 'idle' };

/** Estado del formulario de inicio de sesión (sin el token de la sesión, que nunca sale del servidor). */
export type LoginState =
  | { status: 'idle' }
  | { status: 'invalid'; fieldErrors: FieldErrors; values: FormValues }
  | { status: 'credentials'; values: FormValues }
  | { status: 'unverified'; email: string }
  | { status: 'rate_limited'; retryMinutes: number }
  | { status: 'error' };

/** Estado de los formularios de mascota. */
export type PetFormState =
  | { status: 'idle' }
  | { status: 'ok' }
  | { status: 'invalid'; fieldErrors: FieldErrors; values: FormValues }
  /** Ya tiene el máximo de mascotas (30). */
  | { status: 'limit_reached' }
  /** La mascota no existe o no es suya: se responde con un 404. */
  | { status: 'not_found' }
  | { status: 'expired' }
  | { status: 'error' };
