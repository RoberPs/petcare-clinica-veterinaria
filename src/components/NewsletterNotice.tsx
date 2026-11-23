'use client';

import { useEffect, useRef } from 'react';

// Mensaje uniforme del boletín tras el PRG. Sin JavaScript, el #boletin de la redirección lleva
// hasta él; con JavaScript, Next.js no conserva el fragmento al redirigir desde una Server Action,
// así que el mensaje toma el foco al montarse (y el navegador lo desplaza a la vista).
export function NewsletterNotice({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="newsletter__done" role="status" ref={ref} tabIndex={-1}>
      <p>{text}</p>
    </div>
  );
}
