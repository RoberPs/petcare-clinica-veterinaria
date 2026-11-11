import { noticeText } from '@/lib/notice';

interface Props {
  /** Valor de `?aviso=` tal como llega en searchParams. */
  code: string | string[] | undefined;
}

// Aviso tras una redirección (A14), en una región role="status" para que lo anuncien los lectores de
// pantalla. Si el código no se conoce no se pinta nada.
export function Notice({ code }: Props) {
  const text = noticeText(code);
  if (!text) return null;
  return (
    <div className="form-success notice-status" role="status">
      <p>{text}</p>
    </div>
  );
}
