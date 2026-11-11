'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'summary, a[href], button:not([disabled])';

// Mejora del menú móvil con JavaScript: Escape cierra y devuelve el foco a "Menú", el foco no sale
// del menú mientras está abierto, y se cierra al navegar o al pulsar fuera.
export function MobileNavEnhancer() {
  const marker = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const details = marker.current?.closest('details');
    if (!details) return;
    const summary = details.querySelector('summary');

    const onKeyDown = (event: KeyboardEvent) => {
      if (!details.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        details.open = false;
        summary?.focus();
        return;
      }
      if (event.key === 'Tab') {
        const items = [...details.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (details.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  // Al cambiar de página, el menú se cierra.
  useEffect(() => {
    const details = marker.current?.closest('details');
    if (details) details.open = false;
  }, [pathname]);

  return <span ref={marker} hidden />;
}
