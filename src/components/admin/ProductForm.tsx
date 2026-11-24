'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { VAT_RATES } from '@/domain/vat';
import { ADMIN_IDLE, type AdminFormState } from '@/lib/admin/form-state';
import { describedBy, ErrorSummary, FieldError, fieldId, formMessage, TextField, type Errors } from '../FormParts';
import { ProductImage } from '../ProductImage';
import { useFormFocus } from '../useFormFocus';

interface Option {
  id: string;
  name: string;
  published: boolean;
}

export interface ProductFormInitial {
  id: string;
  name: string;
  shortDescription: string;
  descriptionMd: string;
  ingredientsMd: string | null;
  usageMd: string | null;
  categoryId: string;
  petIds: string[];
  priceCents: number;
  compareAtCents: number | null;
  vatRate: number;
  stock: number;
  isNew: boolean;
  published: boolean;
  position: number;
  imagePath: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

interface Props {
  action: (prev: AdminFormState, form: FormData) => Promise<AdminFormState>;
  submissionToken: string;
  categories: Option[];
  pets: Option[];
  initial?: ProductFormInitial;
}

const LABELS = {
  name: 'Nombre',
  short_description: 'Descripción corta',
  description_md: 'Descripción',
  ingredients_md: 'Composición',
  usage_md: 'Modo de uso',
  category_id: 'Categoría',
  pet_ids: 'Mascotas',
  price: 'Precio',
  compare_at: 'Precio anterior',
  vat_rate: 'IVA',
  stock_initial: 'Stock inicial',
  position: 'Posición en Destacados',
  image: 'Foto',
  image_alt: 'Texto alternativo de la foto',
};

/** 1250 → "12,50" (lo que se escribe en el campo). */
const centsToField = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','));
const asList = (v: string | string[] | undefined) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

function TextArea({
  name,
  label,
  errors,
  defaultValue,
  maxLength,
  rows = 4,
  optional,
  hint,
}: {
  name: string;
  label: string;
  errors: Errors;
  defaultValue?: string;
  maxLength: number;
  rows?: number;
  optional?: boolean;
  hint?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <div className={errors[name] ? 'field field--invalid' : 'field'}>
      <label htmlFor={fieldId(name)}>
        {label}
        {optional ? <span className="field__optional"> (opcional)</span> : null}
      </label>
      <textarea
        id={fieldId(name)}
        name={name}
        rows={rows}
        maxLength={maxLength}
        required={!optional}
        defaultValue={defaultValue}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy(name, errors, hintId)}
      />
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      <FieldError name={name} errors={errors} />
    </div>
  );
}

// Formulario de alta y edición de un producto (US1, FR-003 a FR-006 y FR-025). Funciona sin
// JavaScript: se envía como multipart con la foto. El stock solo se escribe en el alta; después,
// en la página de ajuste.
export function ProductForm({ action, submissionToken, categories, pets, initial }: Props) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, ADMIN_IDLE);
  const { hydrated, summaryRef } = useFormFocus(state);
  const invalid = state.status === 'invalid';
  const errors = invalid ? state.fieldErrors : {};
  const values = invalid ? state.values : {};
  const str = (k: string) => (typeof values[k] === 'string' ? (values[k] as string) : undefined);
  const flag = (k: string, fallback: boolean) => (invalid ? values[k] !== undefined : fallback);
  const checkedPets = new Set(asList(values.pet_ids) ?? initial?.petIds ?? []);
  const imageChosen = invalid && values.image_chosen === '1';
  const self = initial ? `/admin/productos/${initial.id}` : '/admin/productos/nuevo';
  // React 19 restablece el formulario tras la acción, pero un <select> no recoge el defaultValue
  // nuevo: se remonta el formulario con cada respuesta para pintar lo escrito.
  const formKey = invalid ? JSON.stringify(values) : state.status;

  return (
    <form key={formKey} className="panel form" action={formAction} encType="multipart/form-data" noValidate={hydrated}>
      <ErrorSummary errors={errors} labels={LABELS} summaryRef={summaryRef} message={formMessage(state, self)} />
      <input type="hidden" name="submission" value={submissionToken} />
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <TextField name="name" label="Nombre" required maxLength={80} defaultValue={str('name') ?? initial?.name} errors={errors} />
      <TextArea
        name="short_description"
        label="Descripción corta"
        rows={2}
        maxLength={200}
        defaultValue={str('short_description') ?? initial?.shortDescription}
        hint="De 10 a 200 caracteres. Se ve en el listado del catálogo."
        errors={errors}
      />
      <TextArea
        name="description_md"
        label="Descripción"
        rows={8}
        maxLength={5000}
        defaultValue={str('description_md') ?? initial?.descriptionMd}
        hint="De 20 a 5000 caracteres. Admite Markdown sencillo."
        errors={errors}
      />
      <TextArea
        name="ingredients_md"
        label="Composición"
        optional
        maxLength={3000}
        defaultValue={str('ingredients_md') ?? initial?.ingredientsMd ?? undefined}
        errors={errors}
      />
      <TextArea name="usage_md" label="Modo de uso" optional maxLength={3000} defaultValue={str('usage_md') ?? initial?.usageMd ?? undefined} errors={errors} />

      <div className={errors.category_id ? 'field field--invalid' : 'field'}>
        <label htmlFor={fieldId('category_id')}>Categoría</label>
        <select
          id={fieldId('category_id')}
          name="category_id"
          required
          defaultValue={str('category_id') ?? initial?.categoryId ?? ''}
          aria-invalid={errors.category_id ? true : undefined}
          aria-describedby={describedBy('category_id', errors)}
        >
          <option value="">Elige una categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.published ? '' : ' (oculta)'}
            </option>
          ))}
        </select>
        <FieldError name="category_id" errors={errors} />
      </div>

      <fieldset className="choice-list" id={fieldId('pet_ids')} aria-describedby={describedBy('pet_ids', errors)}>
        <legend>Mascotas</legend>
        {pets.map((p) => (
          <label key={p.id}>
            <input type="checkbox" name="pet_ids" value={p.id} defaultChecked={checkedPets.has(p.id)} />
            <span>
              {p.name}
              {p.published ? null : ' (oculta)'}
            </span>
          </label>
        ))}
        <FieldError name="pet_ids" errors={errors} />
      </fieldset>

      <TextField
        name="price"
        label="Precio en euros (IVA incluido)"
        inputMode="text"
        required
        defaultValue={str('price') ?? centsToField(initial?.priceCents)}
        hint="Por ejemplo, 12,50. Mayor que 0 y como mucho 9.999,99 €."
        errors={errors}
      />
      <label className="check">
        <input type="checkbox" name="on_sale" defaultChecked={flag('on_sale', initial?.compareAtCents != null)} />
        <span>Oferta (muestra el precio anterior tachado)</span>
      </label>
      <TextField
        name="compare_at"
        label="Precio anterior en euros"
        inputMode="text"
        optional
        defaultValue={str('compare_at') ?? centsToField(initial?.compareAtCents)}
        hint="Solo con «Oferta». Tiene que ser mayor que el precio actual."
        errors={errors}
      />
      <div className={errors.vat_rate ? 'field field--invalid' : 'field'}>
        <label htmlFor={fieldId('vat_rate')}>IVA</label>
        <select
          id={fieldId('vat_rate')}
          name="vat_rate"
          required
          defaultValue={str('vat_rate') ?? String(initial?.vatRate ?? 21)}
          aria-invalid={errors.vat_rate ? true : undefined}
          aria-describedby={describedBy('vat_rate', errors)}
        >
          {VAT_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate} %
            </option>
          ))}
        </select>
        <FieldError name="vat_rate" errors={errors} />
      </div>

      {initial ? (
        <div className="field">
          <span>Stock disponible</span>
          <p>
            {initial.stock} {initial.stock === 1 ? 'unidad' : 'unidades'}.{' '}
            <Link prefetch={false} href={`/admin/productos/${initial.id}/stock`}>
              Ajustar el stock
            </Link>
          </p>
        </div>
      ) : (
        <TextField
          name="stock_initial"
          label="Stock inicial"
          type="number"
          inputMode="numeric"
          required
          min="0"
          max="99999"
          defaultValue={str('stock_initial') ?? '0'}
          errors={errors}
        />
      )}

      <TextField
        name="position"
        label="Posición en Destacados"
        type="number"
        inputMode="numeric"
        required
        min="0"
        max="9999"
        defaultValue={str('position') ?? String(initial?.position ?? 0)}
        hint="Los números más bajos salen antes."
        errors={errors}
      />
      <label className="check">
        <input type="checkbox" name="is_new" defaultChecked={flag('is_new', initial?.isNew ?? false)} />
        <span>Novedad</span>
      </label>
      <label className="check">
        <input type="checkbox" name="published" defaultChecked={flag('published', initial?.published ?? true)} />
        <span>Publicado (visible en el catálogo)</span>
      </label>

      <fieldset className="image-field">
        <legend>Foto</legend>
        {initial?.imagePath ? (
          <ProductImage
            imagePath={initial.imagePath}
            imageAlt={initial.imageAlt}
            imageWidth={initial.imageWidth}
            imageHeight={initial.imageHeight}
            sizes="96px"
            fallbackSize={96}
            className="image-field__preview"
          />
        ) : null}
        <div className="image-field__fields">
          <div className={errors.image ? 'field field--invalid' : 'field'}>
            <label htmlFor={fieldId('image')}>{initial?.imagePath ? 'Sustituir la foto' : 'Foto del producto'}</label>
            <input
              id={fieldId('image')}
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              aria-invalid={errors.image ? true : undefined}
              aria-describedby={describedBy('image', errors, imageChosen ? 'image-again image-hint' : 'image-hint')}
            />
            <span className="field__hint" id="image-hint">
              JPEG, PNG o WebP de hasta 5 MB. Se quitan los datos de ubicación de la foto.
            </span>
            {imageChosen ? (
              <span className="field__hint" id="image-again">
                Por seguridad, el navegador no conserva la foto al volver con errores: vuelve a elegirla.
              </span>
            ) : null}
            <FieldError name="image" errors={errors} />
          </div>
          <TextField
            name="image_alt"
            label="Texto alternativo de la foto"
            optional
            maxLength={150}
            defaultValue={str('image_alt') ?? initial?.imageAlt ?? undefined}
            hint="Describe lo que se ve, de 3 a 150 caracteres. Obligatorio si el producto tiene foto."
            errors={errors}
          />
          {initial?.imagePath ? (
            <label className="check">
              <input type="checkbox" name="remove_image" defaultChecked={flag('remove_image', false)} />
              <span>Quitar la foto</span>
            </label>
          ) : null}
        </div>
      </fieldset>

      <div className="form-actions">
        <button className="btn" type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar producto'}
        </button>
        <Link prefetch={false} className="btn btn--ghost" href="/admin/productos">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
