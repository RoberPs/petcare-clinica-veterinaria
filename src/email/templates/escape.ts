// Escapado HTML de todo el contenido de los correos (principio IV).
const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => MAP[c]!);
}

/** Texto con saltos de línea → HTML escapado con <br>. */
export function nl2br(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

export function layoutHtml(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;
}
