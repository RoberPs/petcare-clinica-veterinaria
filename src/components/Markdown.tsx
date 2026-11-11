import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { isSectionKey, sectionHref, type Section } from '@/domain/sections';

// Markdown restringido (R11): sin HTML crudo y solo con párrafos, enlaces, listas, énfasis y h2/h3.
// Los enlaces "section:<clave>" se resuelven al destino actual de la sección.
const ALLOWED = ['p', 'a', 'ul', 'ol', 'li', 'strong', 'em', 'h2', 'h3'];

export function Markdown({ children, sections }: { children: string; sections: readonly Section[] }) {
  return (
    <ReactMarkdown
      allowedElements={ALLOWED}
      unwrapDisallowed
      skipHtml
      urlTransform={(url) => {
        if (url.startsWith('section:')) {
          const key = url.slice('section:'.length);
          return isSectionKey(key) ? sectionHref(key, sections) : '/';
        }
        return defaultUrlTransform(url);
      }}
      components={{
        a: ({ href, children: linkChildren }) => {
          const external = typeof href === 'string' && /^https?:\/\//.test(href);
          return (
            <a href={href} {...(external ? { rel: 'noopener noreferrer', target: '_blank' } : {})}>
              {linkChildren}
              {external ? <span className="visually-hidden"> (se abre en una ventana nueva)</span> : null}
            </a>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
