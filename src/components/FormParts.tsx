import type { HTMLInputAutoCompleteAttribute, HTMLInputTypeAttribute, ReactNode, Ref } from 'react';

// Piezas comunes de los formularios de la cuenta: campo con su error junto a él (aria-invalid y
// aria-describedby) y resumen de errores enfocable con enlaces a cada campo (principio V).

export type Errors = Record<string, string | undefined>;

export const fieldId = (name: string) => `campo-${name}`;
const errorId = (name: string) => `${name}-error`;

export function describedBy(name: string, errors: Errors, hintId?: string): string | undefined {
  return [hintId, errors[name] ? errorId(name) : null].filter(Boolean).join(' ') || undefined;
}

export function FieldError({ name, errors }: { name: string; errors: Errors }) {
  const message = errors[name];
  return message ? (
    <span className="field__error" id={errorId(name)}>
      {message}
    </span>
  ) : null;
}

interface TextFieldProps {
  name: string;
  label: string;
  errors: Errors;
  type?: HTMLInputTypeAttribute;
  autoComplete?: HTMLInputAutoCompleteAttribute;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric';
  defaultValue?: string;
  required?: boolean;
  optional?: boolean;
  maxLength?: number;
  hint?: ReactNode;
  readOnly?: boolean;
  max?: string;
  min?: string;
}

export function TextField(props: TextFieldProps) {
  const { name, label, errors, hint } = props;
  const hintId = hint ? `${name}-hint` : undefined;
  // La pista y el error van fuera del <label>: así no forman parte del nombre accesible del campo y
  // se leen después, por aria-describedby.
  return (
    <div className={errors[name] ? 'field field--invalid' : 'field'}>
      <label htmlFor={fieldId(name)}>
        {label}
        {props.optional ? <span className="field__optional"> (opcional)</span> : null}
      </label>
      <input
        id={fieldId(name)}
        type={props.type ?? 'text'}
        name={name}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        required={props.required}
        maxLength={props.maxLength}
        defaultValue={props.defaultValue}
        readOnly={props.readOnly}
        max={props.max}
        min={props.min}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy(name, errors, hintId)}
      />
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      <FieldError name={name} errors={errors} />
    </div>
  );
}

interface ErrorSummaryProps {
  errors: Errors;
  /** Etiqueta de cada campo, en el orden en que aparecen en el formulario. */
  labels: Record<string, string>;
  summaryRef?: Ref<HTMLDivElement>;
  /** Mensaje general (sin campo), por ejemplo "inténtalo más tarde". */
  message?: ReactNode;
}

/** Resumen de errores al principio del formulario. Recibe el foco tras un envío no válido. */
export function ErrorSummary({ errors, labels, summaryRef, message }: ErrorSummaryProps) {
  const fields = Object.keys(labels).filter((f) => errors[f]);
  if (fields.length === 0 && !message) return null;
  return (
    <div className="form-summary" role="alert" ref={summaryRef} tabIndex={-1}>
      {message ? <p>{message}</p> : null}
      {fields.length > 0 ? (
        <>
          <p>Revisa {fields.length === 1 ? 'este campo' : `estos ${fields.length} campos`}:</p>
          <ul>
            {fields.map((f) => (
              <li key={f}>
                <a href={`#${fieldId(f)}`}>{labels[f]}</a>: {errors[f]}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** Mensaje general de un envío que no ha llegado a validar los campos (límite, página caducada, error). */
export function formMessage(state: { status: string; retryMinutes?: number }, reloadHref: string): ReactNode {
  switch (state.status) {
    case 'rate_limited': {
      const n = state.retryMinutes ?? 1;
      return `Has hecho varios intentos seguidos. Vuelve a intentarlo en ${n} ${n === 1 ? 'minuto' : 'minutos'}.`;
    }
    case 'expired':
      return (
        <>
          La página ha caducado. <a href={reloadHref}>Recarga la página</a> y vuelve a enviar el formulario.
        </>
      );
    case 'error':
      return 'No hemos podido completar la operación. Inténtalo de nuevo en unos minutos.';
    default:
      return null;
  }
}

