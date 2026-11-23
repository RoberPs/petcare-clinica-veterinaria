// Enlaces GET de los pasos de /pide-cita (B5): el estado viaja en la query y nunca lleva datos personales.

export interface BookingParams {
  servicio?: string | null;
  profesional?: string | null;
  fecha?: string | null;
  hora?: string | null;
  mascota?: string | null;
}

const ORDER: (keyof BookingParams)[] = ['servicio', 'profesional', 'fecha', 'hora', 'mascota'];

export function bookingHref(params: BookingParams, base = '/pide-cita'): string {
  const q = new URLSearchParams();
  for (const key of ORDER) {
    const v = params[key];
    if (v) q.set(key, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * Ruta sin página a la que se manda una cita ajena o inexistente: Next.js responde 404 con la página
 * completa también sin JavaScript (como PET_NOT_FOUND_PATH en la 002).
 */
export const APPOINTMENT_NOT_FOUND_PATH = '/mi-cuenta/cita-no-encontrada';
