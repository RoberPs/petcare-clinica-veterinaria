import type { Section } from '@/domain/sections';
import { Markdown } from './Markdown';

// Cuerpo de una publicación (E2): el Markdown restringido de siempre (sin HTML crudo ni elementos
// nuevos) dentro de .prose; los enlaces "section:<clave>" llevan al destino actual de la sección.
export function ArticleBody({ markdown, sections }: { markdown: string; sections: readonly Section[] }) {
  return (
    <div className="article-body">
      <Markdown sections={sections}>{markdown}</Markdown>
    </div>
  );
}
