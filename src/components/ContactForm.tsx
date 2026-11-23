'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { submitContact } from '@/app/contacto/actions';
import { CONTACT_FIELDS, LIMITS, type ContactField } from '@/domain/contact-fields';
import type { ContactResult } from '@/lib/contact-submission';

interface Props {
  token: string;
  reasons: { slug: string; label: string }[];
  phoneDisplay: string;
  phoneE164: string;
}

const LABELS: Record<ContactField, string> = {
  nombre: 'Nombre',
  telefono: 'Teléfono',
  email: 'Correo electrónico',
  motivo: 'Motivo',
  mensaje: 'Mensaje',
  privacidad: 'Política de privacidad',
};

// Formulario de contacto (FR-022 a FR-026). Sin JavaScript es un POST normal al Server Action;
// con JavaScript añade el estado "Enviando…", el contador y el foco en el primer error.
export function ContactForm({ token, reasons, phoneDisplay, phoneE164 }: Props) {
  const [state, formAction, pending] = useActionState<ContactResult, FormData>(submitContact, { status: 'idle' });
  const [hydrated, setHydrated] = useState(false);
  const [length, setLength] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHydrated(true), []);

  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values = state.status === 'invalid' ? state.values : {};

  // El foco va al primer campo con error, o al aviso de éxito o de problema.
  useEffect(() => {
    if (state.status === 'invalid') {
      const first = CONTACT_FIELDS.find((f) => state.fieldErrors[f]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      setLength((state.values.mensaje ?? '').length);
    } else if (state.status === 'ok') {
      successRef.current?.focus();
    } else if (state.status !== 'idle') {
      summaryRef.current?.focus();
    }
  }, [state]);

  if (state.status === 'ok') {
    return (
      <div className="form-success" role="status" tabIndex={-1} ref={successRef}>
        <h2>Mensaje enviado</h2>
        <p>Gracias por escribirnos. Te responderemos {state.responseTimeText}.</p>
        <p>
          Te hemos enviado un correo de confirmación. Si es urgente, llámanos al{' '}
          <a className="link-underline" href={`tel:${phoneE164}`}>
            {phoneDisplay}
          </a>
          .
        </p>
        <Link prefetch={false} className="btn btn--ghost" href="/">
          Volver a la portada
        </Link>
      </div>
    );
  }

  const describedBy = (name: ContactField, hint?: string) =>
    [hint, errors[name] ? `${name}-error` : null].filter(Boolean).join(' ') || undefined;
  const fieldClass = (name: ContactField) => (errors[name] ? 'field field--invalid' : 'field');
  const errorText = (name: ContactField) =>
    errors[name] ? (
      <span className="field__error" id={`${name}-error`}>
        {errors[name]}
      </span>
    ) : null;
  const errorList = CONTACT_FIELDS.filter((f) => errors[f]);

  return (
    <form ref={formRef} className="panel form" action={formAction} noValidate={hydrated}>
      <h2>Escríbenos</h2>

      {state.status === 'invalid' ? (
        <div className="form-summary" role="alert" ref={summaryRef} tabIndex={-1}>
          <p>Revisa {errorList.length === 1 ? 'este campo' : `estos ${errorList.length} campos`}:</p>
          <ul>
            {errorList.map((f) => (
              <li key={f}>
                <a href={`#campo-${f}`}>{LABELS[f]}</a>: {errors[f]}
              </li>
            ))}
          </ul>
          <p>
            Si lo prefieres, llámanos al <a href={`tel:${phoneE164}`}>{state.phone}</a>.
          </p>
        </div>
      ) : null}
      {state.status === 'rate_limited' || state.status === 'error' || state.status === 'expired' ? (
        <div className="form-summary" role="alert" ref={summaryRef} tabIndex={-1}>
          <p>
            {state.status === 'rate_limited' ? (
              <>
                Has enviado varios mensajes seguidos. Llámanos al <a href={`tel:${phoneE164}`}>{state.phone}</a>.
              </>
            ) : state.status === 'error' ? (
              <>
                No hemos podido enviar tu mensaje. Inténtalo de nuevo o llámanos al{' '}
                <a href={`tel:${phoneE164}`}>{state.phone}</a>.
              </>
            ) : (
              <>
                La página ha caducado. <a href="/contacto">Recarga la página</a>, revisa tus datos y vuelve a enviar.
              </>
            )}
          </p>
        </div>
      ) : null}

      <input type="hidden" name="submission_token" value={token} />
      {hydrated ? <input type="hidden" name="js" value="1" /> : null}
      <div className="honeypot" aria-hidden="true">
        <label>
          No rellenes este campo
          <input type="text" name="web" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="field-row">
        <label className={fieldClass('nombre')} id="campo-nombre">
          Nombre
          <input
            type="text"
            name="nombre"
            autoComplete="name"
            required
            maxLength={LIMITS.nombre}
            defaultValue={values.nombre}
            aria-invalid={errors.nombre ? true : undefined}
            aria-describedby={describedBy('nombre')}
          />
          {errorText('nombre')}
        </label>
        <label className={fieldClass('telefono')} id="campo-telefono">
          <span>
            Teléfono <span className="field__optional">(opcional)</span>
          </span>
          <input
            type="tel"
            name="telefono"
            autoComplete="tel"
            inputMode="tel"
            maxLength={LIMITS.telefono}
            defaultValue={values.telefono}
            aria-invalid={errors.telefono ? true : undefined}
            aria-describedby={describedBy('telefono', 'telefono-hint')}
          />
          <span className="field__hint" id="telefono-hint">
            Solo si prefieres que te llamemos.
          </span>
          {errorText('telefono')}
        </label>
      </div>

      <label className={fieldClass('email')} id="campo-email">
        Correo electrónico
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={LIMITS.email}
          defaultValue={values.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy('email')}
        />
        {errorText('email')}
      </label>

      <label className={fieldClass('motivo')} id="campo-motivo">
        Motivo
        <select
          name="motivo"
          required
          defaultValue={values.motivo ?? ''}
          aria-invalid={errors.motivo ? true : undefined}
          aria-describedby={describedBy('motivo')}
        >
          <option value="" disabled>
            Elige un motivo
          </option>
          {reasons.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.label}
            </option>
          ))}
        </select>
        {errorText('motivo')}
      </label>

      <label className={fieldClass('mensaje')} id="campo-mensaje">
        Mensaje
        <textarea
          name="mensaje"
          rows={6}
          required
          minLength={LIMITS.mensajeMin}
          maxLength={LIMITS.mensajeMax}
          defaultValue={values.mensaje}
          onChange={(e) => setLength(e.currentTarget.value.length)}
          aria-invalid={errors.mensaje ? true : undefined}
          aria-describedby={describedBy('mensaje', 'mensaje-hint')}
        />
        <span className="field__hint" id="mensaje-hint">
          {hydrated
            ? `${length.toLocaleString('es-ES')} de ${LIMITS.mensajeMax.toLocaleString('es-ES')} caracteres`
            : 'Entre 10 y 2.000 caracteres.'}
        </span>
        {errorText('mensaje')}
      </label>

      <div id="campo-privacidad">
        <label className={errors.privacidad ? 'check check--invalid' : 'check'}>
          <input
            type="checkbox"
            name="privacidad"
            required
            defaultChecked={values.privacidad === 'on'}
            aria-invalid={errors.privacidad ? true : undefined}
            aria-describedby={describedBy('privacidad')}
          />
          <span>
            He leído y acepto la{' '}
            <Link prefetch={false} className="link-underline" href="/privacidad">
              política de privacidad
            </Link>
            .
          </span>
        </label>
        {errorText('privacidad')}
      </div>

      <button className="btn btn--pink form__submit" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar mensaje'}
      </button>
    </form>
  );
}
