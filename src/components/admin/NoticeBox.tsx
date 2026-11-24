'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Caja de los avisos del panel tras el PRG. Sin JavaScript, la página se carga arriba y el aviso
// queda a la vista; con JavaScript, Next.js conserva el desplazamiento al redirigir desde una Server
// Action, así que el aviso toma el foco al montarse o al cambiar (y el navegador lo desplaza a la
// vista), como NewsletterNotice (SC-007).
export function NoticeBox({
  className,
  role,
  focusKey,
  children,
}: {
  className: string;
  role: 'status' | 'alert';
  focusKey: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [focusKey]);
  return (
    <div className={className} role={role} ref={ref} tabIndex={-1}>
      {children}
    </div>
  );
}
