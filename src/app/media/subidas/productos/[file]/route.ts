import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadsDir } from '@/lib/env';

// Fotos de producto subidas desde el panel (G4, contracts/routes.md). Pública y en caché: el nombre
// lleva un uuid nuevo en cada subida, así que el contenido de una URL no cambia nunca. Solo se
// aceptan los nombres de las variantes; cualquier otro (también con "..") da 404 sin tocar el disco.

const FILE_RE = /^[0-9a-f-]{36}-(480|960|1440)\.webp$/;

export const dynamic = 'force-dynamic';

const notFound = () =>
  new Response('No encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  if (!FILE_RE.test(file)) return notFound();
  let data: Buffer;
  try {
    data = await readFile(path.join(uploadsDir(), 'productos', file));
  } catch {
    return notFound();
  }
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
