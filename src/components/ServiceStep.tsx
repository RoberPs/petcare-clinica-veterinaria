import { NO_PREFERENCE } from '@/domain/booking-fields';
import { describedBy, ErrorSummary, FieldError, fieldId } from './FormParts';

interface Option {
  slug: string;
  name: string;
}

interface Props {
  services: (Option & { durationMinutes: number })[];
  /** Profesionales ofrecidos: los del servicio elegido, o todos si aún no hay servicio. */
  staff: Option[];
  selectedService: string | null;
  selectedStaff: string | null;
  /** ?mascota= se conserva entre pasos. */
  pet: string | null;
  errors: Record<string, string | undefined>;
}

const LABELS = { servicio: 'Tipo de servicio', profesional: 'Veterinario/a' };

// Paso 1 (contracts/forms.md): formulario GET. Sin JavaScript, la lista de profesionales se filtra
// al recargar: "Continuar" vuelve aquí si el profesional elegido no atiende el servicio nuevo.
export function ServiceStep({ services, staff, selectedService, selectedStaff, pet, errors }: Props) {
  return (
    <form className="form" method="get" action="/pide-cita" noValidate>
      <ErrorSummary errors={errors} labels={LABELS} />
      <section className="panel" aria-labelledby="paso-servicio">
        <h2 id="paso-servicio">1. ¿Qué necesitas?</h2>
        {pet ? <input type="hidden" name="mascota" value={pet} /> : null}
        <div className={errors.servicio ? 'field field--invalid' : 'field'}>
          <label htmlFor={fieldId('servicio')}>{LABELS.servicio}</label>
          <select
            id={fieldId('servicio')}
            name="servicio"
            required
            defaultValue={selectedService ?? ''}
            aria-invalid={errors.servicio ? true : undefined}
            aria-describedby={describedBy('servicio', errors)}
          >
            <option value="" disabled>
              Elige un servicio
            </option>
            {services.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name} ({s.durationMinutes} min)
              </option>
            ))}
          </select>
          <FieldError name="servicio" errors={errors} />
        </div>
        <div className={errors.profesional ? 'field field--invalid' : 'field'}>
          <label htmlFor={fieldId('profesional')}>{LABELS.profesional}</label>
          <select
            id={fieldId('profesional')}
            name="profesional"
            defaultValue={selectedStaff ?? NO_PREFERENCE}
            aria-invalid={errors.profesional ? true : undefined}
            aria-describedby={describedBy('profesional', errors, 'profesional-hint')}
          >
            <option value={NO_PREFERENCE}>Sin preferencia</option>
            {staff.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="field__hint" id="profesional-hint">
            {selectedService
              ? 'Solo aparecen los profesionales que atienden este servicio.'
              : 'Con "Sin preferencia", te asignamos a quien esté libre.'}
          </span>
          <FieldError name="profesional" errors={errors} />
        </div>
      </section>
      <div className="form-actions">
        <button className="btn btn--sky" type="submit">
          Continuar
        </button>
      </div>
    </form>
  );
}
