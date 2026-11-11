import { PASSWORD_MAX, PASSWORD_MIN } from '@/domain/account-fields';
import { describedBy, FieldError, fieldId, type Errors } from './FormParts';

interface Props {
  errors: Errors;
  /** "Contraseña" en el registro; "Nueva contraseña" al restablecerla o cambiarla. */
  label?: string;
}

// Contraseña y su repetición (registro, restablecimiento y cambio). Nunca se rellenan con el valor
// anterior: tras un error se vuelven a escribir (contracts/forms.md).
export function PasswordFields({ errors, label = 'Contraseña' }: Props) {
  const fieldClass = (name: string) => (errors[name] ? 'field field--invalid' : 'field');
  return (
    <div className="field-row">
      <div className={fieldClass('password')}>
        <label htmlFor={fieldId('password')}>{label}</label>
        <input
          id={fieldId('password')}
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy('password', errors, 'password-hint')}
        />
        <span className="field__hint" id="password-hint">
          Al menos {PASSWORD_MIN} caracteres. Una frase fácil de recordar es una buena opción.
        </span>
        <FieldError name="password" errors={errors} />
      </div>
      <div className={fieldClass('password_confirm')}>
        <label htmlFor={fieldId('password_confirm')}>Repetir contraseña</label>
        <input
          id={fieldId('password_confirm')}
          type="password"
          name="password_confirm"
          autoComplete="new-password"
          required
          maxLength={PASSWORD_MAX}
          aria-invalid={errors.password_confirm ? true : undefined}
          aria-describedby={describedBy('password_confirm', errors)}
        />
        <FieldError name="password_confirm" errors={errors} />
      </div>
    </div>
  );
}
