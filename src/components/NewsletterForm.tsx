'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { resendNewsletterConfirmation, subscribeNewsletter } from '@/app/boletin/actions';
import { NEWSLETTER_EMAIL_MAX } from '@/domain/newsletter-schemas';
import type { NewsletterFormState } from '@/lib/newsletter/subscribe';

interface Props {
  token: string;
  /** Ruta a la que vuelve el formulario (la portada o el listado de consejos). */
  returnTo?: string;
  /** "resend": pedir otro enlace de confirmación (sin casilla de la política). */
  mode?: 'subscribe' | 'resend';
}

const FIELDS = [
  { name: 'email', id: 'boletin-email', label: 'Correo electrónico' },
  { name: 'accept_policy', id: 'boletin-politica', label: 'Política del boletín' },
] as const;

// Formulario del boletín (E9, E16). Sin JavaScript es un POST normal a la Server Action con PRG;
// los errores se pintan junto al campo y en un resumen con role="alert". Ids con prefijo "boletin-".
export function NewsletterForm({ token, returnTo = '/', mode = 'subscribe' }: Props) {
  const action = mode === 'subscribe' ? subscribeNewsletter : resendNewsletterConfirmation;
  const [state, formAction, pending] = useActionState<NewsletterFormState, FormData>(action, { status: 'idle' });
  const [hydrated, setHydrated] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => setHydrated(true), []);

  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values = state.status === 'invalid' ? state.values : {};
  const errorList = FIELDS.filter((f) => errors[f.name]);

  useEffect(() => {
    if (state.status === 'invalid') {
      const first = FIELDS.find((f) => state.fieldErrors[f.name]);
      if (first) formRef.current?.querySelector<HTMLElement>(`#${first.id}`)?.focus();
    } else if (state.status !== 'idle') {
      summaryRef.current?.focus();
    }
  }, [state]);

  const problem =
    state.status === 'rate_limited'
      ? `Has hecho varias solicitudes seguidas. Vuelve a intentarlo dentro de ${state.retryMinutes} ${state.retryMinutes === 1 ? 'minuto' : 'minutos'}.`
      : state.status === 'expired'
        ? 'La página ha caducado. Recarga la página y vuelve a enviar el formulario.'
        : state.status === 'disabled'
          ? 'El boletín no está disponible en este momento.'
          : state.status === 'error'
            ? 'No hemos podido completar la solicitud. Inténtalo de nuevo en unos minutos.'
            : null;

  return (
    <form ref={formRef} className="newsletter-form" action={formAction} noValidate={hydrated}>
      {errorList.length > 0 ? (
        <div className="form-summary" role="alert" ref={summaryRef} tabIndex={-1}>
          <p>Revisa {errorList.length === 1 ? 'este campo' : `estos ${errorList.length} campos`}:</p>
          <ul>
            {errorList.map((f) => (
              <li key={f.name}>
                <a href={`#${f.id}`}>{f.label}</a>: {errors[f.name]}
              </li>
            ))}
          </ul>
        </div>
      ) : problem ? (
        <div className="form-summary" role="alert" ref={summaryRef} tabIndex={-1}>
          <p>{problem}</p>
        </div>
      ) : null}

      <input type="hidden" name="submission_token" value={token} />
      {mode === 'subscribe' ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      <div className="honeypot" aria-hidden="true">
        <label>
          No rellenes este campo
          <input type="text" name="web" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <label className="newsletter-form__label" htmlFor="boletin-email">
        Correo electrónico
      </label>
      <div className={errors.email ? 'search search--invalid' : 'search'}>
        <input
          id="boletin-email"
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={NEWSLETTER_EMAIL_MAX}
          defaultValue={values.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'boletin-email-error' : undefined}
        />
        <button type="submit" className="btn" disabled={pending}>
          {mode === 'subscribe' ? 'Suscribirme' : 'Enviarme otro enlace'}
        </button>
      </div>
      {errors.email ? (
        <p className="field__error" id="boletin-email-error">
          {errors.email}
        </p>
      ) : null}

      {mode === 'subscribe' ? (
        <>
          <label className={errors.accept_policy ? 'check check--invalid' : 'check'}>
            <input
              id="boletin-politica"
              type="checkbox"
              name="accept_policy"
              required
              defaultChecked={values.accept_policy === 'on'}
              aria-invalid={errors.accept_policy ? true : undefined}
              aria-describedby={errors.accept_policy ? 'boletin-politica-error' : undefined}
            />
            <span>
              He leído y acepto la{' '}
              <a className="link-underline" href="/politica-del-boletin">
                política del boletín
              </a>
              .
            </span>
          </label>
          {errors.accept_policy ? (
            <p className="field__error" id="boletin-politica-error">
              {errors.accept_policy}
            </p>
          ) : null}
        </>
      ) : null}
    </form>
  );
}
