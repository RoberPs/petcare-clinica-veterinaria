import { createSubmissionToken } from '@/lib/form-token';
import { BOOKING_MONDAY_9AM, formData } from './db';

// Formulario del paso 3 de la reserva para las pruebas de integración.

export const NOW = BOOKING_MONDAY_9AM;
/** Martes 17/11/2026 (laborable). */
export const TUESDAY = '2026-11-17';

/** Token emitido hace 10 s de reloj real (supera el tiempo mínimo anti-robots). */
export const freshToken = () => createSubmissionToken(new Date(Date.now() - 10_000));

export function guestForm(overrides: Record<string, string | undefined> = {}): FormData {
  return formData({
    servicio: 'consulta-general',
    profesional: 'sin-preferencia',
    fecha: TUESDAY,
    hora: '10:00',
    submission: freshToken(),
    web: '',
    nombre_mascota: 'Lúa',
    especie: 'perro',
    nombre: 'Persona de Prueba',
    telefono: '600 123 456',
    correo: 'invitado@example.test',
    motivo: 'Revisión anual',
    privacidad: 'on',
    ...overrides,
  });
}

export const ctxFor = (ip = '203.0.113.10', now: Date = NOW) => ({ ip, now });
