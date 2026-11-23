// Texto plano de un cuerpo en Markdown (E4): sirve para calcular posts.search_text en la carga.
// No pretende ser un parser completo: quita las marcas habituales y conserva el texto legible.

export function markdownToPlainText(md: string): string {
  return (
    md
      .replace(/\r\n?/g, '\n')
      // Bloques de código delimitados: se conserva su contenido, sin las vallas.
      .replace(/^ {0,3}(```|~~~).*$/gm, '')
      // Imágenes: ![alt](url) → alt.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Enlaces: [texto](url) → texto.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Encabezados, citas y viñetas al principio de la línea.
      .replace(/^ {0,3}#{1,6}\s+/gm, '')
      .replace(/^ {0,3}>\s?/gm, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
      // Reglas horizontales.
      .replace(/^ {0,3}(?:[-*_]\s*){3,}$/gm, '')
      // Énfasis y código en línea.
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(\*|_)(.+?)\1/g, '$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
