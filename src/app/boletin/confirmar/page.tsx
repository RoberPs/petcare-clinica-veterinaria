import type { Metadata } from 'next';
import Link from 'next/link';
import { NewsletterForm } from '@/components/NewsletterForm';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { getNow } from '@/lib/clock';
import { createSubmissionToken } from '@/lib/form-token';
import { peekConfirmation } from '@/lib/newsletter/confirm';
import { confirmNewsletter } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Confirmar la suscripción al boletín',
  description: 'Confirma tu suscripción al boletín.',
};

type Props = { searchParams: Promise<{ t?: string | string[]; estado?: string | string[] }> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <section className="auth__card" aria-labelledby="titulo-boletin">
        <h1 id="titulo-boletin">{title}</h1>
        {children}
      </section>
    </div>
  );
}

function Invalid() {
  return (
    <Card title="El enlace ha caducado o no es válido">
      <p>
        Puede que haya pasado más de una semana o que hayas pedido otro enlace después. Escribe tu correo y te enviaremos
        uno nuevo.
      </p>
      <NewsletterForm token={createSubmissionToken()} mode="resend" />
    </Card>
  );
}

// Confirmación del alta (E8). El GET solo comprueba el token; el botón (POST) confirma.
export default async function ConfirmNewsletterPage({ searchParams }: Props) {
  const sp = await searchParams;
  const estado = first(sp.estado);

  if (estado === 'ok') {
    return (
      <Card title="Suscripción confirmada">
        <div className="status-ok" role="status">
          <p>Ya estás suscrito al boletín. Puedes darte de baja cuando quieras desde el enlace de cualquier correo.</p>
        </div>
        <Link prefetch={false} className="btn" href="/consejos">
          Ver los consejos de salud
        </Link>
      </Card>
    );
  }
  if (estado === 'ya') {
    return (
      <Card title="Tu suscripción ya estaba confirmada">
        <p>No tienes que hacer nada más.</p>
        <Link prefetch={false} className="btn" href="/">
          Volver a la portada
        </Link>
      </Card>
    );
  }
  if (estado === 'reenviado') {
    return (
      <Card title="Revisa tu correo">
        <p role="status">
          Si la dirección tiene una suscripción pendiente, te hemos enviado un enlace nuevo. Si no lo ves, mira en la carpeta
          de spam.
        </p>
      </Card>
    );
  }
  if (estado === 'error') {
    return (
      <Card title="No hemos podido confirmar la suscripción">
        <p role="alert">Ha ocurrido un error. Vuelve a abrir el enlace del correo dentro de unos minutos.</p>
      </Card>
    );
  }
  if (estado === 'invalido') return <Invalid />;

  const token = first(sp.t);
  const peek = await peekConfirmation(token, await getNow());
  if (peek === 'already') {
    return (
      <Card title="Tu suscripción ya estaba confirmada">
        <p>No tienes que hacer nada más.</p>
      </Card>
    );
  }
  if (peek === 'invalid') return <Invalid />;
  return (
    <Card title="Confirma tu suscripción">
      <p>Pulsa el botón para empezar a recibir el boletín.</p>
      <form className="form" action={confirmNewsletter}>
        <input type="hidden" name="t" value={token} />
        <button className="btn btn--block" type="submit">
          Confirmar suscripción
        </button>
      </form>
    </Card>
  );
}
