import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/Notice';
import { ChangePasswordForm, MarketingForm, ProfileForm } from '@/components/ProfileForm';
import { getCustomerById } from '@/db/queries/customers';
import { requireCustomer } from '@/lib/auth/require-customer';

export const metadata: Metadata = { title: 'Datos personales' };

type Props = { searchParams: Promise<{ aviso?: string | string[] }> };

// Datos personales (US6, US7 y US8): correo en solo lectura, datos, preferencia, contraseña,
// descarga de los datos y enlace para eliminar la cuenta.
export default async function PersonalDataPage({ searchParams }: Props) {
  const session = await requireCustomer();
  const [{ aviso }, customer] = await Promise.all([searchParams, getCustomerById(session.id)]);
  if (!customer) return null;

  return (
    <>
      <Notice code={aviso} />
      <section className="panel" aria-labelledby="titulo-correo">
        <h2 id="titulo-correo">Correo electrónico</h2>
        <div className="field">
          <label htmlFor="campo-correo-actual">Correo de la cuenta</label>
          <input id="campo-correo-actual" type="email" value={customer.email} readOnly aria-describedby="correo-hint" />
          <span className="field__hint" id="correo-hint">
            Es tu usuario para entrar. Por ahora no se puede cambiar desde aquí.
          </span>
        </div>
      </section>
      <ProfileForm
        initial={{
          firstName: customer.firstName,
          lastName: customer.lastName,
          phone: customer.phone,
          addressLine: customer.addressLine,
          postalCode: customer.postalCode,
          city: customer.city,
          province: customer.province,
        }}
      />
      <MarketingForm optIn={customer.marketingOptIn} />
      <ChangePasswordForm />
      <section className="panel" aria-labelledby="titulo-tus-datos">
        <h2 id="titulo-tus-datos">Tus datos y tu cuenta</h2>
        <p>Descarga una copia de tus datos y los de tus mascotas en un archivo JSON.</p>
        {/* Formulario normal (POST): funciona sin JavaScript y el navegador guarda el archivo. */}
        <form action="/api/account/export" method="post">
          <button className="btn btn--ghost" type="submit">
            Descargar mis datos
          </button>
        </form>
        <p>
          ¿Ya no quieres tu cuenta?{' '}
          <Link prefetch={false} className="link-underline" href="/mi-cuenta/eliminar-cuenta">
            Eliminar mi cuenta
          </Link>
        </p>
      </section>
    </>
  );
}
