'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { CHECKOUT_LIMITS } from '@/domain/checkout-schemas';
import { formatEur } from '@/domain/money';
import type { PaymentMethod, ShippingKind } from '@/domain/order-status';
import { CHECKOUT_IDLE, type CheckoutFormState } from '@/lib/checkout/form-state';
import { describedBy, ErrorSummary, FieldError, fieldId, formMessage, TextField } from './FormParts';
import { useFormFocus } from './useFormFocus';

export interface CheckoutShippingOption {
  code: string;
  kind: ShippingKind;
  name: string;
  description: string;
  costCents: number;
}

export interface CheckoutPrefill {
  firstName?: string;
  lastName?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
}

interface Props {
  action: (prev: CheckoutFormState, form: FormData) => Promise<CheckoutFormState>;
  token: string;
  cart: 'main' | 'direct';
  /** Importe de los productos que ve el comprador (subtotal − descuento, sin envío). */
  expectedTotalCents: number;
  shippingMethods: CheckoutShippingOption[];
  paymentMethods: PaymentMethod[];
  /** Correo de la cuenta (con sesión) o null (invitado: se pide). */
  accountEmail: string | null;
  /** Enlaces a iniciar sesión y a crear cuenta con vuelta al checkout (invitados). */
  loginHref: string;
  registerHref: string;
  prefill: CheckoutPrefill;
  noticeText: string | null;
  phone: { display: string; e164: string };
}

const LABELS: Record<string, string> = {
  email: 'Correo electrónico',
  first_name: 'Nombre',
  last_name: 'Apellidos',
  shipping_method: 'Método de envío',
  address_line: 'Dirección',
  postal_code: 'Código postal',
  city: 'Ciudad',
  payment_method: 'Método de pago',
};

const PAYMENT_TEXT: Record<PaymentMethod, { name: string; hint: string }> = {
  card: { name: 'Tarjeta', hint: 'Pagarás en la pasarela de pago externa; aquí no se piden los datos de la tarjeta.' },
  in_clinic: { name: 'Pago en la clínica', hint: 'Solo con recogida en la clínica. Pagas al recogerlo.' },
};

function stateMessage(state: CheckoutFormState, phone: React.ReactNode): React.ReactNode {
  switch (state.status) {
    case 'rate_limited': {
      const n = state.retryMinutes;
      return `Has hecho varios pedidos seguidos. Vuelve a intentarlo en ${n} ${n === 1 ? 'minuto' : 'minutos'}.`;
    }
    case 'limit_reached':
      return (
        <>Ya tienes el máximo de pedidos pendientes de pago. Págalos o cancélalos antes de hacer otro, o llámanos al {phone}.</>
      );
    case 'expired':
      return 'El formulario ha caducado. Revisa los datos y confirma de nuevo.';
    case 'error':
      return <>No hemos podido confirmar el pedido. Inténtalo de nuevo en unos minutos o llámanos al {phone}.</>;
    default:
      return formMessage(state, '/finalizar-compra');
  }
}

// Paso 2 de la compra (design/checkout.html): datos, envío y pago, POST a la Server Action. Funciona
// sin JavaScript: los campos de la dirección no se ocultan; el servidor solo los exige con envío a
// domicilio y los descarta con recogida.
export function CheckoutForm(props: Props) {
  const [state, formAction, pending] = useActionState<CheckoutFormState, FormData>(props.action, CHECKOUT_IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const errors = state.status === 'invalid' ? state.fieldErrors : {};
  const values: Record<string, string> = 'values' in state ? state.values : {};
  const token = 'token' in state && state.token ? state.token : props.token;
  const v = (name: string, fallback?: string) => values[name] ?? fallback;
  const phone = <a href={`tel:${props.phone.e164}`}>{props.phone.display}</a>;
  const shipping = v('shipping_method', props.shippingMethods[0]?.code);
  const payment = v('payment_method', props.paymentMethods[0]);
  const hasHome = props.shippingMethods.some((m) => m.kind === 'home_delivery');

  return (
    <form className="form" action={formAction} noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={stateMessage(state, phone)} />

      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="cart" value={props.cart} />
      <input type="hidden" name="expected_total" value={props.expectedTotalCents} />
      <div className="honeypot" aria-hidden="true">
        <label>
          No rellenes este campo
          <input type="text" name="web" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <section className="panel" aria-labelledby="checkout-datos">
        <h2 id="checkout-datos">Tus datos</h2>
        {props.accountEmail ? (
          <TextField
            name="account_email"
            label="Correo electrónico"
            type="email"
            readOnly
            defaultValue={props.accountEmail}
            hint="El de tu cuenta: allí te enviaremos la confirmación."
            errors={{}}
          />
        ) : (
          <>
            <TextField
              name="email"
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              required
              maxLength={CHECKOUT_LIMITS.email}
              defaultValue={v('email')}
              hint="Solo para enviarte la confirmación y el enlace para seguir el pedido."
              errors={errors}
            />
            <p className="product__meta">
              ¿Tienes cuenta?{' '}
              <Link prefetch={false} href={props.loginHref}>
                Inicia sesión
              </Link>{' '}
              o{' '}
              <Link prefetch={false} href={props.registerHref}>
                crea una cuenta
              </Link>{' '}
              para ver tus pedidos en ella. No es obligatorio.
            </p>
          </>
        )}
        <div className="field-row">
          <TextField
            name="first_name"
            label="Nombre"
            autoComplete="given-name"
            required
            maxLength={CHECKOUT_LIMITS.name}
            defaultValue={v('first_name', props.prefill.firstName)}
            errors={errors}
          />
          <TextField
            name="last_name"
            label="Apellidos"
            autoComplete="family-name"
            required
            maxLength={CHECKOUT_LIMITS.name}
            defaultValue={v('last_name', props.prefill.lastName)}
            errors={errors}
          />
        </div>
      </section>

      <fieldset
        className="panel"
        id={fieldId('shipping_method')}
        aria-describedby={describedBy('shipping_method', errors)}
        aria-invalid={errors.shipping_method ? true : undefined}
      >
        <legend>Método de envío</legend>
        {props.shippingMethods.map((m) => (
          <label key={m.code} className="option">
            <input type="radio" name="shipping_method" value={m.code} defaultChecked={shipping === m.code} required />
            <span className="option__text">
              <span>{m.name}</span>
              {m.description ? <small>{m.description}</small> : null}
            </span>
            <span className="option__price">{m.costCents === 0 ? 'Gratis' : formatEur(m.costCents)}</span>
          </label>
        ))}
        <FieldError name="shipping_method" errors={errors} />
      </fieldset>

      {hasHome ? (
        <fieldset className="panel">
          <legend>Dirección de envío</legend>
          <p className="fieldset-hint">Solo para envío a domicilio. Si lo recoges en la clínica, déjala en blanco.</p>
          <TextField
            name="address_line"
            label="Dirección"
            autoComplete="street-address"
            maxLength={CHECKOUT_LIMITS.address}
            defaultValue={v('address_line', props.prefill.addressLine)}
            hint="Calle, número, piso y puerta."
            errors={errors}
          />
          <div className="field-row">
            <TextField
              name="postal_code"
              label="Código postal"
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={5}
              defaultValue={v('postal_code', props.prefill.postalCode)}
              errors={errors}
            />
            <TextField
              name="city"
              label="Ciudad"
              autoComplete="address-level2"
              maxLength={CHECKOUT_LIMITS.city}
              defaultValue={v('city', props.prefill.city)}
              errors={errors}
            />
          </div>
        </fieldset>
      ) : null}

      <fieldset
        className="panel"
        id={fieldId('payment_method')}
        aria-describedby={describedBy('payment_method', errors)}
        aria-invalid={errors.payment_method ? true : undefined}
      >
        <legend>Método de pago</legend>
        {props.paymentMethods.map((p) => (
          <label key={p} className="option">
            <input type="radio" name="payment_method" value={p} defaultChecked={payment === p} required />
            <span className="option__text">
              <span>{PAYMENT_TEXT[p].name}</span>
              <small>{PAYMENT_TEXT[p].hint}</small>
            </span>
          </label>
        ))}
        <FieldError name="payment_method" errors={errors} />
      </fieldset>

      {props.noticeText ? (
        <p className="notice" role="note">
          {props.noticeText}
        </p>
      ) : null}
      <p className="product__meta">
        Al confirmar aceptas las{' '}
        <Link prefetch={false} href="/condiciones-de-venta">
          condiciones de venta
        </Link>{' '}
        y la{' '}
        <Link prefetch={false} href="/privacidad">
          política de privacidad
        </Link>
        .
      </p>

      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Confirmando…' : 'Confirmar pedido'}
        </button>
      </div>
    </form>
  );
}
