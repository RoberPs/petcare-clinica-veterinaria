import type { Metadata } from 'next';
import Link from 'next/link';
import { privateMetadata } from '@/lib/auth/private-metadata';
import { peekUnsubscribe } from '@/lib/newsletter/unsubscribe';
import { unsubscribeNewsletter } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Darse de baja del boletín',
  description: 'Deja de recibir el boletín.',
};

type Props = { searchParams: Promise<{ t?: string | string[]; estado?: string | string[] }> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <section className="auth__card" aria-labelledby="titulo-baja">
        <h1 id="titulo-baja">{title}</h1>
        {children}
      </section>
    </div>
  );
}

const Home = () => (
  <Link prefetch={false} className="btn" href="/">
    Volver a la portada
  </Link>
);

// Baja del boletín (E10): sin sesión y sin JavaScript. El GET muestra el botón; el POST da de baja.
export default async function UnsubscribePage({ searchParams }: Props) {
  const sp = await searchParams;
  const estado = first(sp.estado);

  if (estado === 'ok') {
    return (
      <Card title="Te has dado de baja">
        <div className="status-ok" role="status">
          <p>Ya no recibirás el boletín. Hemos borrado tu dirección de la lista.</p>
        </div>
        <Home />
      </Card>
    );
  }
  if (estado === 'ya') {
    return (
      <Card title="Ya no estás suscrito">
        <p>Esta dirección ya no está en la lista del boletín. No tienes que hacer nada más.</p>
        <Home />
      </Card>
    );
  }
  if (estado === 'error') {
    return (
      <Card title="No hemos podido darte de baja">
        <p role="alert">Ha ocurrido un error. Vuelve a abrir el enlace del correo dentro de unos minutos.</p>
      </Card>
    );
  }

  const token = first(sp.t);
  const peek = estado === 'invalido' ? 'invalid' : await peekUnsubscribe(token);
  if (peek === 'invalid') {
    return (
      <Card title="El enlace de baja no es válido">
        <p>Comprueba que has copiado el enlace completo del correo, o usa el enlace de un correo más reciente.</p>
        <Home />
      </Card>
    );
  }
  if (peek === 'already') {
    return (
      <Card title="Ya no estás suscrito">
        <p>Esta dirección ya no está en la lista del boletín. No tienes que hacer nada más.</p>
        <Home />
      </Card>
    );
  }
  return (
    <Card title="Darte de baja del boletín">
      <p>Pulsa el botón para dejar de recibir el boletín. Borraremos tu dirección de la lista.</p>
      <form className="form" action={unsubscribeNewsletter}>
        <input type="hidden" name="t" value={token} />
        <button className="btn btn--block" type="submit">
          Darme de baja
        </button>
      </form>
    </Card>
  );
}
