import { createSubmissionToken } from '@/lib/form-token';
import { noticeText } from '@/lib/notice';
import { getNewsletterSettings } from '@/db/queries/newsletter';
import { NewsletterForm } from './NewsletterForm';
import { NewsletterNotice } from './NewsletterNotice';

// Bloque del boletín al final de la portada y de /consejos (E13): solo si está activo, con el título
// y el texto de la base de datos. Tras el PRG (?aviso=boletin-revisa-correo#boletin) muestra el
// mensaje uniforme en el propio bloque.
export async function NewsletterBlock({ returnTo, aviso }: { returnTo: string; aviso?: string | string[] }) {
  const settings = await getNewsletterSettings();
  if (!settings.enabled) return null;
  const sent = (Array.isArray(aviso) ? aviso[0] : aviso) === 'boletin-revisa-correo';
  return (
    <section className="newsletter" id="boletin" aria-labelledby="boletin-titulo">
      <div className="container">
        <h2 id="boletin-titulo">{settings.title}</h2>
        <p>{settings.text}</p>
        {sent ? <NewsletterNotice text={noticeText('boletin-revisa-correo') ?? ''} /> : null}
        <NewsletterForm token={createSubmissionToken()} returnTo={returnTo} />
      </div>
    </section>
  );
}
