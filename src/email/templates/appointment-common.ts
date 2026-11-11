import { describeWhen } from '@/domain/availability';
import type { EmailContext } from '../outbox';
import { absoluteUrl, type Block } from './account-layout';

// Piezas comunes de los correos de cita (contracts/emails.md). Los correos al responsable nunca
// llevan el motivo; el de la clínica sí.

export interface AppointmentEmailData {
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  serviceName: string;
  staffName: string;
  petName: string;
  petSpeciesLabel: string;
  startsAt: Date;
  reason: string | null;
  bookedAs: 'guest' | 'customer';
}

export type Variant = 'guest' | 'customer';

/** Asunto en una sola línea (sin saltos que permitan inyectar cabeceras). */
export const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

export const recipient = (d: AppointmentEmailData) => ({ email: d.contactEmail, firstName: d.contactName });

export const clinicFooter = (ctx: EmailContext) =>
  `${ctx.clinicName} · ${ctx.clinicAddress} · Teléfono ${ctx.clinicPhone}`;

/** Servicio, profesional, mascota, fecha, hora y dirección (FR-018). */
export function detailRows(
  ctx: EmailContext,
  d: AppointmentEmailData,
  startsAt: Date = d.startsAt,
): [string, string][] {
  const when = describeWhen(startsAt);
  return [
    ['Servicio', d.serviceName],
    ['Profesional', d.staffName],
    ['Mascota', `${d.petName} (${d.petSpeciesLabel})`],
    ['Fecha', when.longDate],
    ['Hora', when.time],
    ['Dirección', ctx.clinicAddress],
  ];
}

const hoursText = (h: number) => (h === 1 ? '1 hora' : `${h} horas`);

/** Cómo cancelar o cambiar la cita (FR-019): el teléfono para invitados, "Mis citas" para clientes. */
export function changeInstructions(ctx: EmailContext, variant: Variant, cutoffHours: number): Block[] {
  if (variant === 'guest') {
    return [
      {
        p:
          cutoffHours > 0
            ? `Para cancelar o cambiar la cita, llámanos al ${ctx.clinicPhone}, a ser posible con ${hoursText(cutoffHours)} de antelación.`
            : `Para cancelar o cambiar la cita, llámanos al ${ctx.clinicPhone}.`,
      },
    ];
  }
  return [
    {
      p:
        cutoffHours > 0
          ? `Puedes cancelarla o cambiarla desde Mis citas hasta ${hoursText(cutoffHours)} antes. Después, llámanos al ${ctx.clinicPhone}.`
          : `Puedes cancelarla o cambiarla desde Mis citas hasta la hora de la cita.`,
    },
    { link: { label: 'Mis citas', href: absoluteUrl(ctx, '/mi-cuenta/citas') } },
  ];
}
