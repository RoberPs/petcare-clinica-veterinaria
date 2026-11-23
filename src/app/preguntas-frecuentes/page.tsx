import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/Breadcrumb';
import { Markdown } from '@/components/Markdown';
import { getFaqByTopic } from '@/db/queries/faq';
import { getSiteData } from '@/db/queries/site';

export async function generateMetadata(): Promise<Metadata> {
  const { clinic } = await getSiteData();
  return {
    title: 'Preguntas frecuentes',
    description: `Respuestas a las dudas más habituales sobre citas, tienda y cuidados en ${clinic.name}.`,
    alternates: { canonical: '/preguntas-frecuentes' },
  };
}

// Preguntas frecuentes (US6): agrupadas por tema en acordeón nativo, que funciona sin JavaScript.
export default async function FaqPage() {
  const [site, topics] = await Promise.all([getSiteData(), getFaqByTopic()]);
  return (
    <>
      <section className="page-hero page-hero--compact">
        <div className="container">
          <Breadcrumb current="Preguntas frecuentes" />
          <h1>Preguntas frecuentes</h1>
        </div>
      </section>
      <section className="section">
        <div className="container faq">
          {topics.map((topic) => (
            <section key={topic.slug} aria-labelledby={`tema-${topic.slug}`}>
              <h2 id={`tema-${topic.slug}`}>{topic.name}</h2>
              {topic.faqs.map((faq) => (
                <details className="faq__item" key={faq.slug}>
                  <summary>{faq.question}</summary>
                  <Markdown sections={site.sections}>{faq.answerMd}</Markdown>
                </details>
              ))}
            </section>
          ))}
          <div className="cta-box">
            <h2>¿No encuentras lo que buscas?</h2>
            <Link prefetch={false} className="btn btn--pink" href="/contacto">
              Contacto
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
