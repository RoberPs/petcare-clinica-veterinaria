'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Comportamiento común de los formularios con JavaScript: `hydrated` (para desactivar la validación
 * del navegador y marcar el envío con js=1) y el foco en el resumen de errores tras un envío fallido.
 */
export function useFormFocus(state: { status: string }) {
  const [hydrated, setHydrated] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (state.status !== 'idle' && state.status !== 'ok') summaryRef.current?.focus();
  }, [state]);
  return { hydrated, summaryRef };
}
