import Link from 'next/link';
import { describedBy, FieldError, fieldId } from './FormParts';
import { SlotDateGuard } from './SlotDateGuard';

// Elección de fecha y hora (paso 2, cambio de cita y gestión de la clínica). Sin hooks ni
// dependencias de servidor: también lo usa DetailsStep (cliente) cuando la hora se ha ocupado.

export interface SlotRadiosProps {
  /** Horas libres "HH:MM". */
  slots: string[];
  /** Fecha larga para los textos ("martes, 17 de noviembre de 2026"). */
  dayLabel: string;
  selected?: string | null;
  errors?: Record<string, string | undefined>;
  /** Enlace al siguiente día con huecos, si no quedan horas. */
  nextHref?: string | null;
  nextLabel?: string | null;
}

/** fieldset de radios con legend "Horas disponibles" (FR-006: solo se ofrecen las libres). */
export function SlotRadios({ slots, dayLabel, selected, errors = {}, nextHref, nextLabel }: SlotRadiosProps) {
  if (slots.length === 0) {
    return (
      <div className="slots-empty" id={fieldId('hora')} tabIndex={-1}>
        <p>No quedan horas libres el {dayLabel}.</p>
        {nextHref && nextLabel ? (
          <p>
            <Link prefetch={false} href={nextHref}>
              Ver horas del {nextLabel}
            </Link>
          </p>
        ) : (
          <p>No hay huecos en los próximos días. Llámanos y buscamos una hora.</p>
        )}
        <FieldError name="hora" errors={errors} />
      </div>
    );
  }
  return (
    <fieldset
      className={errors.hora ? 'field field--invalid' : 'field'}
      aria-describedby={describedBy('hora', errors)}
    >
      <legend>Horas disponibles</legend>
      <span className="field__hint">El {dayLabel}. Duración según el servicio.</span>
      <div className="slots" id={fieldId('hora')}>
        {slots.map((t, i) => (
          <label className="slot-option" key={t}>
            <input type="radio" name="hora" value={t} defaultChecked={t === selected} required={i === 0} />
            <span className="slot">{t}</span>
          </label>
        ))}
      </div>
      <FieldError name="hora" errors={errors} />
    </fieldset>
  );
}

interface Props extends SlotRadiosProps {
  /** Ruta de los dos formularios GET (/pide-cita o la de cambiar). */
  action: string;
  /** Campos que se conservan en los GET (servicio, profesional, mascota…). */
  hidden: Record<string, string | null | undefined>;
  date: string;
  min: string;
  max: string;
  /** Texto del error de fecha (paso 2). */
  errors?: Record<string, string | undefined>;
  /** Botón para continuar con la hora elegida. */
  submitLabel: string;
  /** Si se pasa, la hora se envía por POST a esta Server Action (cambio de cita) con `postHidden`. */
  postAction?: (form: FormData) => Promise<void>;
  postHidden?: Record<string, string>;
  /** Campos extra del primer formulario GET (por ejemplo, el selector de profesional al cambiar). */
  extraFields?: React.ReactNode;
}

const HOURS_FORM_ID = 'form-horas';
const PENDING_ID = 'aviso-fecha-pendiente';

const hiddenInputs =(hidden: Props['hidden']) =>
  Object.entries(hidden)
    .filter(([, v]) => v)
    .map(([k, v]) => <input key={k} type="hidden" name={k} value={v!} />);

/**
 * Paso 2: dos formularios GET. El primero cambia la fecha ("Ver horas"); el segundo elige la hora y
 * continúa. Así, sin JavaScript, cambiar la fecha nunca envía una hora del día anterior.
 */
export function SlotPicker(props: Props) {
  const { action, hidden, date, min, max, errors = {}, submitLabel } = props;
  return (
    <>
      <form className="form" method="get" action={action} noValidate>
        {hiddenInputs(hidden)}
        {props.extraFields}
        <div className={errors.fecha ? 'field field--invalid' : 'field'}>
          <label htmlFor={fieldId('fecha')}>Fecha</label>
          <input
            id={fieldId('fecha')}
            type="date"
            name="fecha"
            required
            min={min}
            max={max}
            defaultValue={date}
            aria-invalid={errors.fecha ? true : undefined}
            aria-describedby={describedBy('fecha', errors)}
          />
          <FieldError name="fecha" errors={errors} />
          <p className="field__hint" id={PENDING_ID} role="status" hidden />
          <SlotDateGuard date={date} hoursFormId={HOURS_FORM_ID} messageId={PENDING_ID} />
        </div>
        <div className="form-actions">
          <button className="btn btn--ghost" type="submit">
            Ver horas
          </button>
        </div>
      </form>
      {errors.fecha ? null : (
        <form
          className="form"
          id={HOURS_FORM_ID}
          {...(props.postAction ? { action: props.postAction } : { method: 'get', action })}
          noValidate
        >
          {hiddenInputs({ ...hidden, ...props.postHidden, fecha: date })}
          <SlotRadios {...props} />
          {props.slots.length > 0 ? (
            <div className="form-actions">
              <button className="btn btn--sky" type="submit">
                {submitLabel}
              </button>
            </div>
          ) : null}
        </form>
      )}
    </>
  );
}
