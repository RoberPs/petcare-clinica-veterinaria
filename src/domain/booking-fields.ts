// Constantes de los formularios de reserva, sin dependencias: las importan también los componentes
// de cliente sin arrastrar Zod ni Temporal.

export const NO_PREFERENCE = 'sin-preferencia';
/** Valor de "Otra mascota…" en el selector de mascotas del cliente. */
export const OTHER_PET = 'otra';
/** Valor de la opción "Otra" del selector de especie (A10). */
export const OTHER_SPECIES = 'other';

export const BOOKING_LIMITS = { petName: 40, name: 100, phone: 20, email: 254, reason: 500 } as const;
