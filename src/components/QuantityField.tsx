// Campo de cantidad (FR-001, FR-005): etiqueta siempre presente (visible o solo para lectores de
// pantalla) y límites del navegador; el servidor vuelve a acotar con clampQuantity.
interface Props {
  id: string;
  name?: string;
  label?: string;
  /** Etiqueta solo para lectores de pantalla. */
  hiddenLabel?: boolean;
  defaultValue?: number;
  max: number;
  /** 0 en el carrito (0 = eliminar); 1 al añadir. */
  min?: number;
}

export function QuantityField({ id, name = 'quantity', label = 'Cantidad', hiddenLabel = false, defaultValue = 1, max, min = 1 }: Props) {
  return (
    <div className="field">
      <label htmlFor={id} className={hiddenLabel ? 'visually-hidden' : undefined}>
        {label}
      </label>
      <span className="qty qty--field">
        <input id={id} name={name} type="number" inputMode="numeric" min={min} max={Math.max(min, max)} step={1} defaultValue={defaultValue} required />
      </span>
    </div>
  );
}
