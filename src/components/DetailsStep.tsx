'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { BOOKING_LIMITS, OTHER_PET, OTHER_SPECIES } from '@/domain/booking-fields';
import { BOOKING_IDLE, type BookingFormState } from '@/lib/booking/form-state';
import { NOTICES } from '@/lib/notice';
import { describedBy, ErrorSummary, FieldError, fieldId, TextField } from './FormParts';
import { SlotRadios } from './SlotPicker';
import { useFormFocus } from './useFormFocus';

export interface DetailsCustomer {
  name: string;
  email: string;
  /** Teléfono de la cuenta (si vale para la cita); si no hay, se pide. */
  phone: string | null;
  pets: { id: string; name: string; speciesLabel: string }[];
  /** ?mascota= (ya comprobado que es suya) u "otra". */
  selectedPet: string | null;
}

/** Horas libres de la fecha cuando la elegida ya no lo está (B5). */
export type TakenSlots = Omit<Extract<BookingFormState, { status: 'slot_taken' }>, 'status' | 'values'>;

interface Props {
  action: (prev: BookingFormState, form: FormData) => Promise<BookingFormState>;
  token: string;
  /** Lo elegido en los pasos 1 y 2 (campos ocultos). */
  choice: { servicio: string; profesional: string; fecha: string; hora: string };
  species: { key: string; label: string }[];
  customer: DetailsCustomer | null;
  /** Enlace a iniciar sesión con return_to a esta misma página (invitados). */
  loginHref: string;
  /** Enlace "Otra mascota…" sin JavaScript (GET con mascota=otra). */
  otherPetHref: string;
  phoneDisplay: string;
  phoneE164: string;
  /** Fecha de hoy (AAAA-MM-DD): el máximo de la fecha de nacimiento. */
  today: string;
  /**
   * La hora de la query ya no está libre al pintar la página (también al volver de un POST sin
   * JavaScript): se elige otra dentro del mismo formulario.
   */
  taken?: TakenSlots | null;
}

const LABELS: Record<string, string> = {
  hora: 'Hora',
  mascota: 'Mascota',
  nombre_mascota: 'Nombre de la mascota',
  especie: 'Especie',
  fecha_nacimiento: 'Fecha de nacimiento',
  nombre: 'Nombre y apellidos',
  telefono: 'Teléfono',
  correo: 'Correo electrónico',
  motivo: 'Motivo de la consulta',
  privacidad: 'Política de privacidad',
  servicio: 'Servicio',
  profesional: 'Profesional',
  fecha: 'Fecha',
};

/** Sin ninguna hora libre ese día (cierre, domingo o completo) no es "se acaba de ocupar". */
const takenNotice = (taken: TakenSlots) =>
  taken.slots.length === 0 ? NOTICES['dia-sin-horas'] : NOTICES['hora-ocupada'];

function stateMessage(state: BookingFormState, phone: React.ReactNode): React.ReactNode {
  switch (state.status) {
    case 'slot_taken':
      return takenNotice(state);
    case 'rate_limited': {
      const n = state.retryMinutes;
      return (
        <>
          Has hecho varias reservas seguidas. Inténtalo en {n} {n === 1 ? 'minuto' : 'minutos'} o llámanos al{' '}
          {phone}.
        </>
      );
    }
    case 'limit_reached':
      return (
        <>
          {NOTICES['limite-citas']} Teléfono: {phone}.
        </>
      );
    case 'expired':
      return 'El formulario ha caducado. Revisa los datos y confirma de nuevo.';
    case 'error':
      return (
        <>No hemos podido confirmar la cita. Inténtalo de nuevo en unos minutos o llámanos al {phone}.</>
      );
    default:
      return null;
  }
}

// Paso 3 (contracts/forms.md): mascota y tus datos, POST a la Server Action con PRG. Si la hora se
// ha ocupado, vuelve a pintarse con lo escrito y las horas libres dentro del mismo formulario (B5).
export function DetailsStep(props: Props) {
  const { customer, choice, species } = props;
  const [state, formAction, pending] = useActionState<BookingFormState, FormData>(props.action, BOOKING_IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values: Record<string, string> = 'values' in state ? state.values : {};
  const token = 'token' in state && state.token ? state.token : props.token;
  const initialPet = values.mascota ?? customer?.selectedPet ?? customer?.pets[0]?.id ?? OTHER_PET;
  const [petChoice, setPetChoice] = useState<string | null>(null);
  const currentPet = petChoice ?? initialPet;
  const showNewPet = !customer || currentPet === OTHER_PET;
  const phone = <a href={`tel:${props.phoneE164}`}>{props.phoneDisplay}</a>;
  const v = (name: string, fallback?: string) => values[name] ?? fallback;
  const taken: TakenSlots | null = state.status === 'slot_taken' ? state : (props.taken ?? null);
  const message = state.status === 'idle' && taken ? takenNotice(taken) : stateMessage(state, phone);

  return (
    <form className="form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={message} />

      <input type="hidden" name="servicio" value={choice.servicio} />
      <input type="hidden" name="profesional" value={choice.profesional} />
      <input type="hidden" name="submission" value={token} />
      <div className="honeypot" aria-hidden="true">
        <label>
          No rellenes este campo
          <input type="text" name="web" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {taken ? (
        <section className="panel" aria-labelledby="paso-hora">
          <h2 id="paso-hora">Elige otra hora</h2>
          <input type="hidden" name="fecha" value={taken.date} />
          <SlotRadios
            slots={taken.slots.map((s) => s.time)}
            dayLabel={taken.dayLabel}
            selected={state.status === 'invalid' ? values.hora : null}
            errors={errors}
            nextHref={taken.nextHref}
            nextLabel={taken.nextLabel}
          />
        </section>
      ) : (
        <>
          <input type="hidden" name="fecha" value={v('fecha', choice.fecha)} />
          <input type="hidden" name="hora" value={v('hora', choice.hora)} />
          {errors.hora || errors.fecha ? (
            <p className="field__error" id={fieldId('hora')}>
              {errors.hora ?? errors.fecha}
            </p>
          ) : null}
        </>
      )}

      <section className="panel" aria-labelledby="paso-mascota">
        <h2 id="paso-mascota">2. Tu mascota</h2>
        {customer ? (
          <div className={errors.mascota ? 'field field--invalid' : 'field'}>
            <label htmlFor={fieldId('mascota')}>Mascota</label>
            <select
              key={initialPet}
              id={fieldId('mascota')}
              name="mascota"
              defaultValue={initialPet}
              onChange={(e) => setPetChoice(e.currentTarget.value)}
              aria-invalid={errors.mascota ? true : undefined}
              aria-describedby={describedBy('mascota', errors, hydrated ? undefined : 'mascota-hint')}
            >
              {customer.pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.speciesLabel})
                </option>
              ))}
              <option value={OTHER_PET}>Otra mascota…</option>
            </select>
            {!hydrated && currentPet !== OTHER_PET ? (
              <span className="field__hint" id="mascota-hint">
                ¿Es otra?{' '}
                <Link prefetch={false} href={props.otherPetHref}>
                  Añade sus datos
                </Link>
                ; se guardará en tu cuenta.
              </span>
            ) : null}
            <FieldError name="mascota" errors={errors} />
          </div>
        ) : null}

        {showNewPet ? (
          <>
            <div className="field-row">
              <TextField
                name="nombre_mascota"
                label={customer ? 'Nombre de la mascota nueva' : 'Nombre de la mascota'}
                required
                maxLength={BOOKING_LIMITS.petName}
                defaultValue={v('nombre_mascota')}
                errors={errors}
              />
              <div className={errors.especie ? 'field field--invalid' : 'field'}>
                <label htmlFor={fieldId('especie')}>Especie</label>
                <select
                  key={v('especie', '')}
                  id={fieldId('especie')}
                  name="especie"
                  required
                  defaultValue={v('especie', '')}
                  aria-invalid={errors.especie ? true : undefined}
                  aria-describedby={describedBy('especie', errors)}
                >
                  <option value="" disabled>
                    Elige la especie
                  </option>
                  {species.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                  <option value={OTHER_SPECIES}>Otra</option>
                </select>
                <FieldError name="especie" errors={errors} />
              </div>
            </div>
            {customer ? (
              <TextField
                name="fecha_nacimiento"
                label="Fecha de nacimiento"
                type="date"
                required
                max={props.today}
                defaultValue={v('fecha_nacimiento')}
                hint="Si no la sabes con exactitud, pon una aproximada."
                errors={errors}
              />
            ) : (
              <p className="product__meta">
                ¿Tienes cuenta?{' '}
                <Link prefetch={false} href={props.loginHref}>
                  Inicia sesión
                </Link>{' '}
                para elegir entre tus mascotas guardadas.
              </p>
            )}
          </>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="paso-datos">
        <h2 id="paso-datos">3. Tus datos</h2>
        {customer ? (
          <>
            <div className="field-row">
              <TextField
                name="nombre_cuenta"
                label="Nombre y apellidos"
                readOnly
                defaultValue={customer.name}
                errors={{}}
              />
              {customer.phone ? (
                <TextField
                  name="telefono_cuenta"
                  label="Teléfono"
                  type="tel"
                  readOnly
                  defaultValue={customer.phone}
                  errors={{}}
                />
              ) : (
                <TextField
                  name="telefono"
                  label="Teléfono"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                  maxLength={BOOKING_LIMITS.phone}
                  defaultValue={v('telefono')}
                  hint="Para avisarte si hay algún cambio. No se guarda en tu cuenta."
                  errors={errors}
                />
              )}
            </div>
            <TextField
              name="correo_cuenta"
              label="Correo electrónico"
              type="email"
              readOnly
              defaultValue={customer.email}
              hint="Los datos de tu cuenta. Puedes cambiarlos en Datos personales."
              errors={{}}
            />
          </>
        ) : (
          <>
            <div className="field-row">
              <TextField
                name="nombre"
                label="Nombre y apellidos"
                autoComplete="name"
                required
                maxLength={BOOKING_LIMITS.name}
                defaultValue={v('nombre')}
                errors={errors}
              />
              <TextField
                name="telefono"
                label="Teléfono"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                maxLength={BOOKING_LIMITS.phone}
                defaultValue={v('telefono')}
                errors={errors}
              />
            </div>
            <TextField
              name="correo"
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              required
              maxLength={BOOKING_LIMITS.email}
              defaultValue={v('correo')}
              hint="Te enviaremos aquí la confirmación de la cita."
              errors={errors}
            />
          </>
        )}

        <div className={errors.motivo ? 'field field--invalid' : 'field'}>
          <label htmlFor={fieldId('motivo')}>
            Motivo de la consulta<span className="field__optional"> (opcional)</span>
          </label>
          <textarea
            id={fieldId('motivo')}
            name="motivo"
            rows={3}
            maxLength={BOOKING_LIMITS.reason}
            defaultValue={v('motivo')}
            aria-invalid={errors.motivo ? true : undefined}
            aria-describedby={describedBy('motivo', errors, 'motivo-hint')}
          />
          <span className="field__hint" id="motivo-hint">
            Solo lo que el veterinario necesite saber de tu mascota (hasta {BOOKING_LIMITS.reason}{' '}
            caracteres). No incluyas datos de salud de personas ni otros datos personales.
          </span>
          <FieldError name="motivo" errors={errors} />
        </div>

        <div id={fieldId('privacidad')}>
          <label className={errors.privacidad ? 'check check--invalid' : 'check'}>
            <input
              type="checkbox"
              name="privacidad"
              required
              defaultChecked={values.privacidad === 'on'}
              aria-invalid={errors.privacidad ? true : undefined}
              aria-describedby={describedBy('privacidad', errors)}
            />
            <span>
              He leído y acepto la{' '}
              <Link prefetch={false} href="/privacidad">
                política de privacidad
              </Link>
              .
            </span>
          </label>
          <FieldError name="privacidad" errors={errors} />
        </div>
      </section>

      <div className="form-actions">
        <button className="btn btn--sky" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Confirmando…' : 'Confirmar cita'}
        </button>
      </div>
    </form>
  );
}
