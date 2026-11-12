// Avisos tras una redirección (A14): las URL llevan ?aviso=<código> y aquí se traduce a un texto fijo.
// Nunca llevan datos del usuario; un código desconocido se ignora.

export const NOTICES = {
  'enlace-reenviado':
    'Si la dirección tiene una cuenta pendiente de confirmar, te hemos enviado un enlace nuevo.',
  'correo-verificado': 'Tu correo está confirmado. Ya puedes iniciar sesión.',
  'sesion-cerrada': 'Has cerrado la sesión.',
  'mascota-anadida': 'Hemos añadido a tu mascota.',
  'mascota-guardada': 'Hemos guardado los cambios de tu mascota.',
  'mascota-eliminada': 'Hemos eliminado a tu mascota.',
  'datos-guardados': 'Hemos guardado tus datos.',
  'contrasena-cambiada': 'Hemos cambiado tu contraseña y cerrado la sesión en tus otros dispositivos.',
  'contrasena-restablecida': 'Tu contraseña ha cambiado. Inicia sesión con la nueva.',
  'cuenta-eliminada': 'Hemos eliminado tu cuenta y todos sus datos.',
  // Reserva de citas (feature 003).
  'hora-ocupada': 'Esa hora se acaba de ocupar. Elige otra de las horas libres.',
  'dia-sin-horas': 'Ese día no hay horas libres. Elige otro día.',
  'cita-cancelada': 'Hemos cancelado la cita y enviado la confirmación por correo.',
  'cita-cambiada': 'Hemos cambiado la cita y enviado los nuevos datos por correo.',
  'fuera-de-plazo': 'Ya no se puede cancelar ni cambiar esta cita desde la web. Llama a la clínica.',
  'cita-no-disponible': 'Esta cita ya no se puede cancelar ni cambiar: está cancelada o ya ha pasado.',
  'limite-citas': 'Ya tienes el máximo de citas pendientes. Para pedir otra, llama a la clínica.',
  'error-cita':
    'No hemos podido completar la operación. Inténtalo de nuevo en unos minutos o llama a la clínica.',
} as const;

export type NoticeCode = keyof typeof NOTICES;

export function isNoticeCode(value: unknown): value is NoticeCode {
  return typeof value === 'string' && Object.hasOwn(NOTICES, value);
}

/** Texto del aviso de `?aviso=`, o null si no hay o no se conoce. Acepta el valor tal cual de searchParams. */
export function noticeText(value: string | string[] | undefined | null): string | null {
  const code = Array.isArray(value) ? value[0] : value;
  return isNoticeCode(code) ? NOTICES[code] : null;
}

/** Añade ?aviso= a una ruta interna. */
export function withNotice(path: string, code: NoticeCode): string {
  return `${path}${path.includes('?') ? '&' : '?'}aviso=${code}`;
}
