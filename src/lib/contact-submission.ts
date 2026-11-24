import { MESSAGES, validateContact, type ContactField } from '@/domain/contact-schema';
import { isRateLimited, toBucket } from '@/domain/rate-limit';
import { countRecentHits, createContactMessage, findReason } from '@/db/queries/contact';
import { getSiteData } from '@/db/queries/site';
import { getEnv } from './env';
import { verifySubmissionToken } from './form-token';
import { logErrorCode, logger } from './logger';

export type ContactResult =
  | { status: 'idle' }
  | { status: 'ok'; responseTimeText: string }
  | {
      status: 'invalid';
      fieldErrors: Partial<Record<ContactField, string>>;
      values: Partial<Record<ContactField, string>>;
      phone: string;
    }
  | { status: 'rate_limited'; phone: string }
  | { status: 'expired' }
  | { status: 'error'; phone: string };

export interface SubmissionOutcome {
  result: ContactResult;
  /** Solo si se ha registrado un mensaje nuevo: hay que intentar enviarlo. */
  newMessageId?: string;
}

const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === 'string' ? v : undefined;
};

/**
 * Lógica del formulario de contacto (contracts/contact-form.md), sin dependencias de la petición:
 * campo trampa → token → límite por IP → validación → registro en una transacción.
 */
export async function processContactSubmission(
  form: FormData,
  ctx: { ip: string; now?: Date },
): Promise<SubmissionOutcome> {
  const { clinic } = await getSiteData();
  const ok: ContactResult = { status: 'ok', responseTimeText: clinic.responseTimeText };
  const phone = clinic.phoneDisplay;

  // 1. Campo trampa relleno: éxito aparente sin guardar nada.
  if ((field(form, 'web') ?? '').trim() !== '') return { result: ok };

  // 2. Token firmado: idempotencia y tiempo mínimo de 3 s (más rápido = automatizado: éxito aparente).
  const token = verifySubmissionToken(form.get('submission_token'), ctx.now);
  if (!token.ok) return { result: token.reason === 'too_fast' ? ok : { status: 'expired' } };

  // 3. Límite por origen (5 envíos cada 10 minutos por IP o prefijo /64).
  const env = getEnv();
  const bucket = toBucket(ctx.ip, env.FORM_SECRET);
  try {
    if (isRateLimited(await countRecentHits(bucket))) {
      logger.warn({ code: 'rate_limited' }, 'contact_rate_limited');
      return { result: { status: 'rate_limited', phone } };
    }
  } catch (error) {
    logger.error({ code: logErrorCode(error) }, 'contact_rate_check_failed');
    return { result: { status: 'error', phone } };
  }

  // 4. Validación en el servidor (autoridad). El motivo tiene que existir en la base de datos.
  const raw = {
    nombre: field(form, 'nombre'),
    telefono: field(form, 'telefono'),
    email: field(form, 'email'),
    motivo: field(form, 'motivo'),
    mensaje: field(form, 'mensaje'),
    privacidad: field(form, 'privacidad'),
  };
  const validation = validateContact(raw);
  const reason = raw.motivo?.trim() ? await findReason(raw.motivo.trim()) : null;
  if (!validation.ok || !reason) {
    const fieldErrors = validation.ok ? {} : { ...validation.fieldErrors };
    if (!reason) fieldErrors.motivo ??= MESSAGES.motivo;
    const values = validation.ok ? (raw as Partial<Record<ContactField, string>>) : validation.values;
    return { result: { status: 'invalid', fieldErrors, values, phone } };
  }

  // 5. Registro del mensaje, sus correos y el uso del límite en una sola transacción.
  try {
    const created = await createContactMessage({ submissionId: token.submissionId, data: validation.data, reason, bucket });
    logger.info({ message_id: created.id, created: created.created }, 'contact_received');
    return { result: ok, newMessageId: created.created ? created.id : undefined };
  } catch (error) {
    logger.error({ code: logErrorCode(error) }, 'contact_store_failed');
    return { result: { status: 'error', phone } };
  }
}
