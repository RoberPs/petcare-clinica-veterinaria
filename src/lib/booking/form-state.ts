import type { FieldErrors, FormValues } from '@/domain/account-schemas';

// Estado del paso 3 de la reserva (contracts/forms.md). Sin dependencias de servidor: lo importan
// también los componentes de cliente.

export interface SlotOption {
  time: string;
}

/**
 * `token`: el token del envío, que sigue sin usar si no se ha creado la cita. Se devuelve para que,
 * sin JavaScript, la página vuelta a pintar no estrene un token (que aún no tendría los 3 s mínimos).
 */
type WithToken = { token?: string };

export type BookingFormState =
  | { status: 'idle' }
  | ({ status: 'invalid'; fieldErrors: FieldErrors; values: FormValues } & WithToken)
  /** La hora se ha ocupado: se vuelve a pintar el paso 3 con las horas libres de esa fecha (B5). */
  | ({
      status: 'slot_taken';
      values: FormValues;
      date: string;
      dayLabel: string;
      slots: SlotOption[];
      /** Enlace GET al paso 2 con el siguiente día con huecos, si ese día ya no queda ninguno. */
      nextHref: string | null;
      nextLabel: string | null;
    } & WithToken)
  | ({ status: 'rate_limited'; retryMinutes: number; values: FormValues } & WithToken)
  | ({ status: 'limit_reached'; values: FormValues } & WithToken)
  /** Con un token nuevo y lo escrito, para confirmar de nuevo sin volver a escribir. */
  | { status: 'expired'; token: string; values: FormValues }
  | ({ status: 'error'; values: FormValues } & WithToken);

export const BOOKING_IDLE: BookingFormState = { status: 'idle' };
