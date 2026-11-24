import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { VAT_RATES } from '../domain/vat';

// Esquema de data-model.md. Ningún campo de contenido tiene un valor por defecto de una clínica concreta.

const id = () => uuid('id').primaryKey().defaultRandom();
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
const position = () => integer('position').notNull().default(0);
const published = () => boolean('published').notNull().default(true);
/** Lista SQL de los tipos de IVA (T007): `(0, 4, 10, 21)`. */
const vatRatesSql = sql.raw(`(${VAT_RATES.join(', ')})`);

// ---------- Contenido ----------

export const clinic = pgTable(
  'clinic',
  {
    id: id(),
    singleton: boolean('singleton').notNull().default(true).unique(),
    name: text('name').notNull(),
    logoPath: text('logo_path'),
    heroTitle: text('hero_title').notNull(),
    heroText: text('hero_text').notNull(),
    heroImagePath: text('hero_image_path'),
    heroImageAlt: text('hero_image_alt'),
    aboutTitle: text('about_title'),
    aboutText: text('about_text'),
    aboutImagePath: text('about_image_path'),
    aboutImageAlt: text('about_image_alt'),
    addressLine: text('address_line').notNull(),
    postalCode: text('postal_code').notNull(),
    city: text('city').notNull(),
    province: text('province').notNull(),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    phoneE164: text('phone_e164').notNull(),
    phoneDisplay: text('phone_display').notNull(),
    publicEmail: text('public_email'),
    inboxEmail: text('inbox_email').notNull(),
    responseTimeText: text('response_time_text').notNull(),
    legalOwnerName: text('legal_owner_name').notNull(),
    legalOwnerTaxId: text('legal_owner_tax_id'),
    legalOwnerAddress: text('legal_owner_address'),
    legalContactEmail: text('legal_contact_email').notNull(),
    demoBannerEnabled: boolean('demo_banner_enabled').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    check('clinic_singleton', sql`${t.singleton}`),
    check('clinic_name_len', sql`char_length(${t.name}) between 1 and 80`),
    check('clinic_hero_len', sql`char_length(${t.heroTitle}) <= 120 and char_length(${t.heroText}) <= 300`),
    check('clinic_hero_alt', sql`${t.heroImagePath} is null or ${t.heroImageAlt} is not null`),
    check('clinic_about_alt', sql`${t.aboutImagePath} is null or ${t.aboutImageAlt} is not null`),
  ],
);

export const openingHours = pgTable(
  'opening_hours',
  {
    id: id(),
    weekday: smallint('weekday').notNull(),
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
  },
  (t) => [
    check('opening_hours_weekday', sql`${t.weekday} between 1 and 7`),
    check('opening_hours_range', sql`${t.opensAt} < ${t.closesAt}`),
    index('opening_hours_weekday_idx').on(t.weekday, t.opensAt),
  ],
);

export const closures = pgTable(
  'closures',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    reason: text('reason').notNull(),
    published: published(),
    ...timestamps,
  },
  (t) => [check('closures_range', sql`${t.startsOn} <= ${t.endsOn}`), index('closures_ends_on_idx').on(t.endsOn)],
);

export const services = pgTable(
  'services',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    position: position(),
    published: published(),
    ...timestamps,
  },
  (t) => [
    check('services_name_len', sql`char_length(${t.name}) between 1 and 80`),
    check('services_description_len', sql`char_length(${t.description}) between 1 and 600`),
    index('services_order_idx').on(t.published, t.position, t.slug),
  ],
);

export const teamMembers = pgTable(
  'team_members',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    specialty: text('specialty').notNull(),
    photoPath: text('photo_path'),
    photoAlt: text('photo_alt'),
    position: position(),
    published: published(),
    // Feature 007 (F5): reservable y orden en el selector de la reserva y en la agenda.
    bookable: boolean('bookable').notNull().default(false),
    bookingPosition: integer('booking_position').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check('team_specialty_len', sql`char_length(${t.specialty}) between 1 and 120`),
    check('team_photo_alt', sql`${t.photoPath} is null or ${t.photoAlt} is not null`),
    index('team_order_idx').on(t.published, t.position, t.slug),
  ],
);

export const faqTopics = pgTable('faq_topics', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  position: position(),
  published: published(),
  ...timestamps,
});

export const faqs = pgTable(
  'faqs',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => faqTopics.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answerMd: text('answer_md').notNull(),
    position: position(),
    published: published(),
    ...timestamps,
  },
  (t) => [
    check('faqs_question_len', sql`char_length(${t.question}) between 1 and 200`),
    index('faqs_topic_idx').on(t.topicId, t.position),
  ],
);

export const activityStats = pgTable('activity_stats', {
  id: id(),
  slug: text('slug').notNull().unique(),
  valueText: text('value_text').notNull(),
  label: text('label').notNull(),
  description: text('description'),
  position: position(),
  published: published(),
  ...timestamps,
});

export const healthNotices = pgTable(
  'health_notices',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    text: text('text').notNull(),
    sourceLabel: text('source_label').notNull(),
    sourceUrl: text('source_url').notNull(),
    position: position(),
    published: published(),
    ...timestamps,
  },
  (t) => [check('health_notices_https', sql`${t.sourceUrl} like 'https://%'`)],
);

export const contactReasons = pgTable('contact_reasons', {
  id: id(),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  position: position(),
  published: published(),
  ...timestamps,
});

export const legalKind = pgEnum('legal_kind', [
  'aviso-legal',
  'privacidad',
  'cookies',
  'terminos',
  'condiciones-venta',
  'boletin',
]);

export const legalPages = pgTable('legal_pages', {
  id: id(),
  kind: legalKind('kind').notNull().unique(),
  title: text('title').notNull(),
  bodyMd: text('body_md').notNull(),
  version: text('version').notNull(),
  updatedOn: date('updated_on').notNull(),
  ...timestamps,
});

export const sectionKey = pgEnum('section_key', ['reservas', 'tienda', 'carrito', 'consejos', 'cuenta']);

export const sections = pgTable('sections', {
  key: sectionKey('key').primaryKey(),
  label: text('label').notNull(),
  href: text('href'),
  ...timestamps,
});

// ---------- Operación ----------

export const contactMessages = pgTable(
  'contact_messages',
  {
    id: id(),
    submissionId: uuid('submission_id').notNull().unique(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email').notNull(),
    reasonId: uuid('reason_id')
      .notNull()
      .references(() => contactReasons.id),
    reasonLabel: text('reason_label').notNull(),
    message: text('message').notNull(),
    privacyAcceptedAt: timestamp('privacy_accepted_at', { withTimezone: true }).notNull(),
    privacyVersion: text('privacy_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    purgeAfter: timestamp('purge_after', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('contact_name_len', sql`char_length(${t.name}) between 1 and 100`),
    check('contact_phone_len', sql`${t.phone} is null or char_length(${t.phone}) <= 20`),
    check('contact_email_len', sql`char_length(${t.email}) <= 254`),
    check('contact_message_len', sql`char_length(${t.message}) between 10 and 2000`),
    index('contact_messages_purge_idx').on(t.purgeAfter),
  ],
);

export const outboxKind = pgEnum('outbox_kind', [
  'clinic_notification',
  'visitor_ack',
  'verify_email',
  'account_exists',
  'password_reset',
  'password_changed',
  'account_deleted',
  'appointment_confirmed',
  'appointment_changed',
  'appointment_cancelled',
  'appointment_reminder',
  'clinic_appointment',
  'order_confirmed',
  'order_received',
  'order_cancelled',
  'clinic_order',
  'newsletter_confirm',
  // Feature 008 (G11): cambio de estado de un pedido hecho por la clínica.
  'order_status',
]);
export const outboxStatus = pgEnum('outbox_status', ['pending', 'sent', 'failed', 'skipped_rate_limit']);

/** Correo ya renderizado (A8): solo existe mientras el correo está pendiente. */
export interface OutboxPayload {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: id(),
    // Nulo en los correos de cuenta (A8): esos llevan el payload ya renderizado.
    contactMessageId: uuid('contact_message_id').references(() => contactMessages.id, { onDelete: 'cascade' }),
    // Sobrevive al borrado de la cuenta (SET NULL): así se envía el aviso "account_deleted".
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    // Correos de cita (feature 003): sirve para trazar y para purgar.
    appointmentId: uuid('appointment_id').references(() => appointments.id, { onDelete: 'set null' }),
    // Correos de pedido (feature 005): sirve para trazar y para purgar.
    orderId: uuid('order_id').references((): AnyPgColumn => orders.id, { onDelete: 'set null' }),
    payload: jsonb('payload').$type<OutboxPayload>(),
    kind: outboxKind('kind').notNull(),
    recipientHash: text('recipient_hash').notNull(),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastErrorCode: text('last_error_code'),
    providerMessageId: text('provider_message_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('email_outbox_message_kind').on(t.contactMessageId, t.kind),
    check('email_outbox_attempts', sql`${t.attempts} between 0 and 8`),
    check(
      'email_outbox_source',
      sql`${t.contactMessageId} is not null or ${t.payload} is not null or ${t.status} in ('sent', 'failed', 'skipped_rate_limit')`,
    ),
    index('email_outbox_pending_idx').on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
    index('email_outbox_ack_idx').on(t.recipientHash, t.createdAt),
    index('email_outbox_customer_idx').on(t.customerId),
    index('email_outbox_appointment_idx').on(t.appointmentId),
    index('email_outbox_order_idx').on(t.orderId),
  ],
);

export const rateLimitHits = pgTable(
  'rate_limit_hits',
  {
    id: id(),
    bucket: text('bucket').notNull(),
    hitAt: timestamp('hit_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rate_limit_hits_bucket_idx').on(t.bucket, t.hitAt)],
);

// ---------- Cuentas de cliente (feature 002, data-model.md) ----------

export const customers = pgTable(
  'customers',
  {
    id: id(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull().unique(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone'),
    addressLine: text('address_line'),
    postalCode: text('postal_code'),
    city: text('city'),
    province: text('province'),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    marketingOptInChangedAt: timestamp('marketing_opt_in_changed_at', { withTimezone: true }),
    // Feature 007 (F1): solo lo escribe `npm run admin`.
    isAdmin: boolean('is_admin').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    check('customers_email_len', sql`char_length(${t.email}) between 3 and 254`),
    check('customers_first_name_len', sql`char_length(${t.firstName}) between 1 and 80`),
    check('customers_last_name_len', sql`char_length(${t.lastName}) between 1 and 80`),
    check('customers_phone_len', sql`${t.phone} is null or char_length(${t.phone}) <= 30`),
    check('customers_address_len', sql`${t.addressLine} is null or char_length(${t.addressLine}) <= 120`),
    check('customers_postal_code', sql`${t.postalCode} is null or ${t.postalCode} ~ '^[0-9]{5}$'`),
    check('customers_city_len', sql`${t.city} is null or char_length(${t.city}) <= 80`),
    check('customers_province_len', sql`${t.province} is null or char_length(${t.province}) <= 80`),
    check('customers_postal_city', sql`(${t.postalCode} is null) = (${t.city} is null)`),
    index('customers_unverified_idx').on(t.createdAt).where(sql`${t.emailVerifiedAt} is null`),
  ],
);

export const consentKind = pgEnum('consent_kind', ['privacy_terms', 'marketing_opt_in', 'marketing_opt_out']);

export const customerConsents = pgTable(
  'customer_consents',
  {
    id: id(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    kind: consentKind('kind').notNull(),
    privacyVersion: text('privacy_version'),
    termsVersion: text('terms_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('customer_consents_customer_idx').on(t.customerId, t.createdAt)],
);

export const customerSessions = pgTable(
  'customer_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    remember: boolean('remember').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('customer_sessions_customer_idx').on(t.customerId),
    index('customer_sessions_expires_idx').on(t.expiresAt),
  ],
);

export const tokenPurpose = pgEnum('token_purpose', ['verify_email', 'reset_password']);

export const accountTokens = pgTable(
  'account_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    purpose: tokenPurpose('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_tokens_customer_purpose_idx').on(t.customerId, t.purpose)],
);

export const species = pgTable(
  'species',
  {
    key: text('key').primaryKey(),
    label: text('label').notNull(),
    sortOrder: smallint('sort_order').notNull(),
  },
  (t) => [
    check('species_key_format', sql`${t.key} ~ '^[a-z][a-z0-9-]{0,31}$' and ${t.key} <> 'other'`),
    check('species_label_len', sql`char_length(${t.label}) between 1 and 40`),
  ],
);

export const pets = pgTable(
  'pets',
  {
    id: id(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    speciesKey: text('species_key').references(() => species.key, { onDelete: 'set null', onUpdate: 'cascade' }),
    birthDate: date('birth_date').notNull(),
    ...timestamps,
  },
  (t) => [
    check('pets_name_len', sql`char_length(${t.name}) between 1 and 40 and ${t.name} = btrim(${t.name})`),
    index('pets_customer_name_idx').on(t.customerId, t.name),
  ],
);

export const processedSubmissions = pgTable(
  'processed_submissions',
  {
    submissionId: uuid('submission_id').primaryKey(),
    scope: text('scope').notNull(),
    resultRef: text('result_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('processed_submissions_scope', sql`${t.scope} in ('register', 'pet_create', 'newsletter')`),
    index('processed_submissions_created_idx').on(t.createdAt),
  ],
);

// ---------- Reserva de citas (feature 003, data-model.md) ----------

export const bookingSettings = pgTable(
  'booking_settings',
  {
    singleton: boolean('singleton').primaryKey().default(true),
    slotStepMinutes: smallint('slot_step_minutes').notNull().default(30),
    minLeadMinutes: integer('min_lead_minutes').notNull().default(120),
    horizonDays: smallint('horizon_days').notNull().default(60),
    changeCutoffHours: smallint('change_cutoff_hours').notNull().default(24),
    maxActivePerEmail: smallint('max_active_per_email').notNull().default(3),
    maxActivePerCustomer: smallint('max_active_per_customer').notNull().default(9),
    reminderHoursBefore: smallint('reminder_hours_before').notNull().default(24),
    retentionMonths: smallint('retention_months').notNull().default(12),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('booking_settings_singleton', sql`${t.singleton}`),
    check('booking_settings_step', sql`${t.slotStepMinutes} between 5 and 120`),
    check('booking_settings_lead', sql`${t.minLeadMinutes} between 0 and 10080`),
    check('booking_settings_horizon', sql`${t.horizonDays} between 1 and 365`),
    check('booking_settings_cutoff', sql`${t.changeCutoffHours} between 0 and 168`),
    check('booking_settings_per_email', sql`${t.maxActivePerEmail} between 1 and 20`),
    check('booking_settings_per_customer', sql`${t.maxActivePerCustomer} between 1 and 50`),
    check('booking_settings_reminder', sql`${t.reminderHoursBefore} between 0 and 72`),
    check('booking_settings_retention', sql`${t.retentionMonths} between 1 and 60`),
  ],
);

export const bookingServices = pgTable(
  'booking_services',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    durationMinutes: smallint('duration_minutes').notNull(),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    position: smallint('position').notNull().default(0),
    published: published(),
    ...timestamps,
  },
  (t) => [
    check('booking_services_slug', sql`${t.slug} ~ '^[a-z0-9-]{1,60}$'`),
    check('booking_services_name_len', sql`char_length(${t.name}) between 1 and 80`),
    check('booking_services_duration', sql`${t.durationMinutes} between 5 and 480 and ${t.durationMinutes} % 5 = 0`),
    index('booking_services_order_idx').on(t.published, t.position),
    // Feature 007 (FR-012): nombre único sin distinguir mayúsculas.
    uniqueIndex('booking_services_name_lower_uq').on(sql`lower(${t.name})`),
  ],
);

export const bookingServiceStaff = pgTable(
  'booking_service_staff',
  {
    bookingServiceId: uuid('booking_service_id')
      .notNull()
      .references(() => bookingServices.id, { onDelete: 'cascade' }),
    teamMemberId: uuid('team_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.bookingServiceId, t.teamMemberId] })],
);

export const appointmentStatus = pgEnum('appointment_status', ['confirmed', 'cancelled']);
export const appointmentActor = pgEnum('appointment_actor', ['customer', 'clinic', 'system']);
export const appointmentBookedAs = pgEnum('appointment_booked_as', ['guest', 'customer']);

// La restricción appointments_no_overlap (EXCLUDE USING gist) va en SQL en 0002_appointments (B2).
export const appointments = pgTable(
  'appointments',
  {
    id: id(),
    submissionId: uuid('submission_id').notNull().unique(),
    bookingServiceId: uuid('booking_service_id')
      .notNull()
      .references(() => bookingServices.id, { onDelete: 'restrict' }),
    teamMemberId: uuid('team_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: appointmentStatus('status').notNull().default('confirmed'),
    cancelledBy: appointmentActor('cancelled_by'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    bookedAs: appointmentBookedAs('booked_as').notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    petId: uuid('pet_id').references(() => pets.id, { onDelete: 'set null' }),
    petName: text('pet_name').notNull(),
    petSpeciesLabel: text('pet_species_label').notNull(),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactEmailNormalized: text('contact_email_normalized'),
    contactPhone: text('contact_phone'),
    reason: text('reason'),
    privacyAcceptedAt: timestamp('privacy_accepted_at', { withTimezone: true }).notNull(),
    privacyVersion: text('privacy_version').notNull(),
    manageVersion: integer('manage_version').notNull().default(1),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('appointments_range', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'appointments_cancelled',
      sql`(${t.cancelledBy} is not null) = (${t.status} = 'cancelled') and (${t.cancelledAt} is not null) = (${t.status} = 'cancelled')`,
    ),
    check('appointments_pet_name_len', sql`char_length(${t.petName}) between 1 and 40`),
    check(
      'appointments_contact_name_len',
      sql`${t.contactName} is null or char_length(${t.contactName}) between 2 and 100`,
    ),
    check('appointments_contact_email_len', sql`${t.contactEmail} is null or char_length(${t.contactEmail}) <= 254`),
    check(
      'appointments_contact_phone_len',
      sql`${t.contactPhone} is null or char_length(${t.contactPhone}) between 9 and 20`,
    ),
    check('appointments_reason_len', sql`${t.reason} is null or char_length(${t.reason}) <= 500`),
    // Anonimizada ⇔ sin datos de contacto (B12). El teléfono puede faltar en una cita sin anonimizar.
    check(
      'appointments_anonymized',
      sql`(${t.anonymizedAt} is not null) = (${t.contactName} is null and ${t.contactEmail} is null and ${t.contactEmailNormalized} is null)`,
    ),
    check(
      'appointments_anonymized_rest',
      sql`${t.anonymizedAt} is null or (${t.reason} is null and ${t.contactPhone} is null)`,
    ),
    index('appointments_staff_start_idx').on(t.teamMemberId, t.startsAt),
    index('appointments_starts_at_idx').on(t.startsAt),
    index('appointments_customer_idx').on(t.customerId, t.startsAt.desc()),
    index('appointments_email_active_idx').on(t.contactEmailNormalized).where(sql`${t.status} = 'confirmed'`),
    index('appointments_guest_retention_idx')
      .on(t.startsAt)
      .where(sql`${t.bookedAs} = 'guest' and ${t.anonymizedAt} is null`),
    index('appointments_reminder_idx')
      .on(t.startsAt)
      .where(sql`${t.status} = 'confirmed' and ${t.reminderSentAt} is null`),
  ],
);

// ---------- Panel de administración de la agenda (feature 007, data-model.md) ----------

// La exclusión staff_hours_no_overlap (EXCLUDE USING gist) va en SQL en 0006_admin_agenda (F6).
export const staffHours = pgTable(
  'staff_hours',
  {
    id: id(),
    teamMemberId: uuid('team_member_id')
      .notNull()
      .references(() => teamMembers.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
  },
  (t) => [
    check('staff_hours_weekday', sql`${t.weekday} between 1 and 7`),
    check('staff_hours_range', sql`${t.closesAt} > ${t.opensAt}`),
    index('staff_hours_member_idx').on(t.teamMemberId, t.weekday),
  ],
);

export const scheduleBlockKind = pgEnum('schedule_block_kind', ['once', 'weekly']);

export const scheduleBlocks = pgTable(
  'schedule_blocks',
  {
    id: uuid('id').primaryKey(),
    teamMemberId: uuid('team_member_id').references(() => teamMembers.id, { onDelete: 'cascade' }),
    kind: scheduleBlockKind('kind').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    fromDate: date('from_date'),
    untilDate: date('until_date'),
    weekdays: smallint('weekdays').array(),
    startTime: time('start_time'),
    endTime: time('end_time'),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by').references(() => customers.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    check('schedule_blocks_reason_len', sql`char_length(${t.reason}) between 1 and 120`),
    check(
      'schedule_blocks_once',
      sql`${t.kind} <> 'once' or (${t.startsAt} is not null and ${t.endsAt} is not null and ${t.endsAt} > ${t.startsAt}
        and ${t.fromDate} is null and ${t.untilDate} is null and ${t.weekdays} is null and ${t.startTime} is null and ${t.endTime} is null)`,
    ),
    check(
      'schedule_blocks_weekly',
      sql`${t.kind} <> 'weekly' or (${t.fromDate} is not null and ${t.untilDate} is not null and ${t.untilDate} >= ${t.fromDate}
        and ${t.untilDate} - ${t.fromDate} <= 366
        and ${t.weekdays} is not null and cardinality(${t.weekdays}) > 0 and ${t.weekdays} <@ array[1,2,3,4,5,6,7]::smallint[]
        and ${t.startTime} is not null and ${t.endTime} is not null and ${t.endTime} > ${t.startTime}
        and ${t.startsAt} is null and ${t.endsAt} is null)`,
    ),
    index('schedule_blocks_member_idx').on(t.teamMemberId),
    index('schedule_blocks_once_idx').on(t.kind, t.endsAt),
    index('schedule_blocks_weekly_idx').on(t.kind, t.untilDate),
  ],
);

export const appointmentEventKind = pgEnum('appointment_event_kind', ['created', 'rescheduled', 'cancelled']);
export const appointmentEventActor = pgEnum('appointment_event_actor', [
  'customer',
  'guest_link',
  'clinic_link',
  'admin',
  'system',
]);

export const appointmentEvents = pgTable(
  'appointment_events',
  {
    id: id(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    kind: appointmentEventKind('kind').notNull(),
    actor: appointmentEventActor('actor').notNull(),
    adminId: uuid('admin_id').references(() => customers.id, { onDelete: 'set null' }),
    fromStartsAt: timestamp('from_starts_at', { withTimezone: true }),
    toStartsAt: timestamp('to_starts_at', { withTimezone: true }),
    fromStaffId: uuid('from_staff_id').references(() => teamMembers.id),
    toStaffId: uuid('to_staff_id').references(() => teamMembers.id),
    note: text('note'),
  },
  (t) => [
    check('appointment_events_note_len', sql`${t.note} is null or char_length(${t.note}) <= 300`),
    check('appointment_events_admin', sql`${t.adminId} is null or ${t.actor} = 'admin'`),
    index('appointment_events_appointment_idx').on(t.appointmentId, t.at),
  ],
);

export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: id(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id').references(() => customers.id, { onDelete: 'set null' }),
    actorLabel: text('actor_label'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    changes: jsonb('changes').notNull().default({}),
  },
  (t) => [
    // Sin CHECK "actor_id o actor_label": ON DELETE SET NULL lo violaría al borrar la cuenta de un
    // admin del panel. Lo exige recordAdminAction al insertar (desviación anotada en checklists).
    index('admin_audit_log_entity_idx').on(t.entityType, t.entityId, t.at),
  ],
);

// ---------- Catálogo de la tienda (feature 004, data-model.md) ----------

export const productCategories = pgTable(
  'product_categories',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    position: position(),
    published: published(),
    ...timestamps,
  },
  (t) => [
    check('product_categories_slug', sql`${t.slug} ~ '^[a-z0-9-]{1,60}$'`),
    check('product_categories_name_len', sql`char_length(${t.name}) between 1 and 60`),
    index('product_categories_order_idx').on(t.published, t.position),
  ],
);

export const productPets = pgTable(
  'product_pets',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    position: position(),
    published: published(),
    ...timestamps,
  },
  (t) => [
    check('product_pets_slug', sql`${t.slug} ~ '^[a-z0-9-]{1,60}$'`),
    check('product_pets_name_len', sql`char_length(${t.name}) between 1 and 40`),
    index('product_pets_order_idx').on(t.published, t.position),
  ],
);

export const products = pgTable(
  'products',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    searchName: text('search_name').notNull(),
    shortDescription: text('short_description').notNull(),
    descriptionMd: text('description_md').notNull(),
    ingredientsMd: text('ingredients_md'),
    usageMd: text('usage_md'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => productCategories.id, { onDelete: 'restrict' }),
    priceCents: integer('price_cents').notNull(),
    compareAtCents: integer('compare_at_cents'),
    vatRate: smallint('vat_rate').notNull(),
    stock: integer('stock').notNull().default(0),
    isNew: boolean('is_new').notNull().default(false),
    position: position(),
    imagePath: text('image_path'),
    imageAlt: text('image_alt'),
    // Feature 008 (G4): dimensiones de la variante mayor de una foto subida; nulas en las SVG.
    imageWidth: integer('image_width'),
    imageHeight: integer('image_height'),
    published: published(),
    ...timestamps,
  },
  (t) => [
    check('products_slug', sql`${t.slug} ~ '^[a-z0-9-]{1,80}$'`),
    check('products_name_len', sql`char_length(${t.name}) between 1 and 120`),
    check('products_short_description_len', sql`char_length(${t.shortDescription}) between 1 and 300`),
    check('products_price_positive', sql`${t.priceCents} > 0`),
    check('products_compare_at_positive', sql`${t.compareAtCents} is null or ${t.compareAtCents} > 0`),
    check('products_vat_rate', sql`${t.vatRate} in ${vatRatesSql}`),
    check('products_stock_non_negative', sql`${t.stock} >= 0`),
    check('products_image_alt', sql`${t.imagePath} is null or char_length(coalesce(${t.imageAlt}, '')) > 0`),
    check(
      'products_image_size',
      sql`(${t.imageWidth} is null and ${t.imageHeight} is null) or (${t.imageWidth} > 0 and ${t.imageHeight} > 0)`,
    ),
    index('products_listing_idx').on(t.published, t.categoryId),
    index('products_order_idx').on(t.published, t.position),
  ],
);

export const productPetLinks = pgTable(
  'product_pet_links',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    petId: uuid('pet_id')
      .notNull()
      .references(() => productPets.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.petId] }), index('product_pet_links_pet_idx').on(t.petId)],
);

export const shopSettings = pgTable(
  'shop_settings',
  {
    singleton: boolean('singleton').primaryKey().default(true),
    shippingText: text('shipping_text').notNull(),
    pageSize: smallint('page_size').notNull().default(12),
    demoNoticeEnabled: boolean('demo_notice_enabled').notNull().default(false),
    demoNoticeText: text('demo_notice_text'),
    metaDescription: text('meta_description').notNull(),
    // Feature 005: bloque checkout: del YAML.
    cardEnabled: boolean('card_enabled').notNull().default(true),
    inClinicEnabled: boolean('in_clinic_enabled').notNull().default(false),
    reservationMinutes: smallint('reservation_minutes').notNull().default(30),
    pickupDays: smallint('pickup_days').notNull().default(7),
    cartRetentionDays: smallint('cart_retention_days').notNull().default(30),
    maxQtyPerLine: smallint('max_qty_per_line').notNull().default(10),
    maxPendingPerEmail: smallint('max_pending_per_email').notNull().default(3),
    maxPendingPerCustomer: smallint('max_pending_per_customer').notNull().default(3),
    orderPrefix: text('order_prefix').notNull().default('PED-'),
    guestLinkDays: smallint('guest_link_days').notNull().default(90),
    checkoutNoticeText: text('checkout_notice_text'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('shop_settings_singleton', sql`${t.singleton}`),
    check('shop_settings_shipping_len', sql`char_length(${t.shippingText}) between 1 and 40`),
    check('shop_settings_page_size', sql`${t.pageSize} between 4 and 48`),
    check(
      'shop_settings_demo_notice',
      sql`not ${t.demoNoticeEnabled} or char_length(coalesce(${t.demoNoticeText}, '')) > 0`,
    ),
    check('shop_settings_reservation', sql`${t.reservationMinutes} between 30 and 120`),
    check('shop_settings_pickup_days', sql`${t.pickupDays} between 1 and 30`),
    check('shop_settings_cart_retention', sql`${t.cartRetentionDays} between 1 and 90`),
    check('shop_settings_max_qty', sql`${t.maxQtyPerLine} between 1 and 99`),
    check('shop_settings_pending_email', sql`${t.maxPendingPerEmail} between 1 and 10`),
    check('shop_settings_pending_customer', sql`${t.maxPendingPerCustomer} between 1 and 10`),
    check('shop_settings_order_prefix', sql`${t.orderPrefix} ~ '^[A-Z0-9-]{1,6}$'`),
    check('shop_settings_guest_link', sql`${t.guestLinkDays} between 7 and 365`),
  ],
);

// ---------- Carrito y pago (feature 005, data-model.md) ----------

export const cartKind = pgEnum('cart_kind', ['main', 'direct']);
export const shippingKind = pgEnum('shipping_kind', ['home_delivery', 'clinic_pickup']);
export const paymentMethod = pgEnum('payment_method', ['card', 'in_clinic']);
export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'paid',
  'preparing',
  'shipped',
  'ready_for_pickup',
  'delivered',
  'cancelled',
]);
export const reservationStatus = pgEnum('reservation_status', ['held', 'committed', 'released']);
export const orderActor = pgEnum('order_actor', ['customer', 'system', 'clinic', 'gateway']);
export const cancelReason = pgEnum('cancel_reason', [
  'customer',
  'expired',
  'replaced',
  'stock_unavailable',
  'clinic',
  'account_deleted',
]);
export const refundStatus = pgEnum('refund_status', ['none', 'pending', 'refunded', 'failed']);
export const paymentStatus = pgEnum('payment_status', ['open', 'succeeded', 'expired', 'refunded']);
export const discountKind = pgEnum('discount_kind', ['percent', 'fixed']);

/** Número de pedido (D6): order_prefix + lpad(nextval, 6). Los huecos se aceptan. */
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 1, increment: 1 });

export const shippingMethods = pgTable(
  'shipping_methods',
  {
    id: id(),
    code: text('code').notNull().unique(),
    kind: shippingKind('kind').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    costCents: integer('cost_cents').notNull().default(0),
    vatRate: smallint('vat_rate').notNull().default(21),
    postalPrefixes: text('postal_prefixes').array(),
    enabled: boolean('enabled').notNull().default(true),
    position: position(),
    ...timestamps,
  },
  (t) => [
    check('shipping_methods_code', sql`${t.code} ~ '^[a-z0-9-]{1,40}$'`),
    check('shipping_methods_name_len', sql`char_length(${t.name}) between 1 and 60`),
    check('shipping_methods_description_len', sql`char_length(${t.description}) between 1 and 160`),
    check('shipping_methods_cost', sql`${t.costCents} >= 0`),
    check('shipping_methods_vat_rate', sql`${t.vatRate} in ${vatRatesSql}`),
    check('shipping_methods_prefixes', sql`${t.postalPrefixes} is null or ${t.kind} = 'home_delivery'`),
    uniqueIndex('shipping_methods_one_pickup')
      .on(t.kind)
      .where(sql`${t.kind} = 'clinic_pickup' and ${t.enabled}`),
    index('shipping_methods_order_idx').on(t.enabled, t.position),
  ],
);

export const discountCodes = pgTable(
  'discount_codes',
  {
    id: id(),
    code: text('code').notNull().unique(),
    kind: discountKind('kind').notNull(),
    value: integer('value').notNull(),
    minSubtotalCents: integer('min_subtotal_cents'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    maxUses: integer('max_uses'),
    usesCount: integer('uses_count').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check('discount_codes_code', sql`${t.code} ~ '^[A-Z0-9]{3,20}$'`),
    check(
      'discount_codes_value',
      sql`(${t.kind} = 'percent' and ${t.value} between 1 and 100) or (${t.kind} = 'fixed' and ${t.value} > 0)`,
    ),
    check('discount_codes_min_subtotal', sql`${t.minSubtotalCents} is null or ${t.minSubtotalCents} >= 0`),
    check('discount_codes_range', sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check('discount_codes_max_uses', sql`${t.maxUses} is null or ${t.maxUses} > 0`),
    check(
      'discount_codes_uses',
      sql`${t.usesCount} >= 0 and (${t.maxUses} is null or ${t.usesCount} <= ${t.maxUses})`,
    ),
  ],
);

export const carts = pgTable(
  'carts',
  {
    id: id(),
    kind: cartKind('kind').notNull().default('main'),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash'),
    discountCodeId: uuid('discount_code_id').references(() => discountCodes.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    check('carts_owner', sql`num_nonnulls(${t.customerId}, ${t.tokenHash}) = 1`),
    check('carts_direct_no_discount', sql`${t.kind} = 'main' or ${t.discountCodeId} is null`),
    unique('carts_customer_kind').on(t.customerId, t.kind),
    unique('carts_token_kind').on(t.tokenHash, t.kind),
    index('carts_guest_updated_idx').on(t.updatedAt).where(sql`${t.tokenHash} is not null`),
  ],
);

export const cartItems = pgTable(
  'cart_items',
  {
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: smallint('quantity').notNull(),
    // Precio que vio el comprador al añadir (o al revisar el carrito): permite el aviso "antes X,
    // ahora Y" de FR-006. Nunca se usa para cobrar: el importe sale siempre del precio actual.
    unitPriceCents: integer('unit_price_cents').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cartId, t.productId] }),
    check('cart_items_quantity', sql`${t.quantity} between 1 and 99`),
    check('cart_items_price', sql`${t.unitPriceCents} > 0`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: id(),
    number: text('number').notNull().unique(),
    submissionId: uuid('submission_id').notNull().unique(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    cartId: uuid('cart_id').references(() => carts.id, { onDelete: 'set null' }),
    checkoutFingerprint: text('checkout_fingerprint').notNull(),
    contactEmail: text('contact_email'),
    contactEmailNormalized: text('contact_email_normalized'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    addressLine: text('address_line'),
    postalCode: text('postal_code'),
    city: text('city'),
    shippingMethodCode: text('shipping_method_code').notNull(),
    shippingName: text('shipping_name').notNull(),
    shippingKind: shippingKind('shipping_kind').notNull(),
    shippingCostCents: integer('shipping_cost_cents').notNull(),
    shippingVatRate: smallint('shipping_vat_rate').notNull(),
    paymentMethod: paymentMethod('payment_method').notNull(),
    discountCode: text('discount_code'),
    discountCodeId: uuid('discount_code_id').references(() => discountCodes.id, { onDelete: 'set null' }),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    vatCents: integer('vat_cents').notNull(),
    status: orderStatus('status').notNull().default('pending_payment'),
    reservationStatus: reservationStatus('reservation_status').notNull().default('held'),
    reservationExpiresAt: timestamp('reservation_expires_at', { withTimezone: true }),
    pickupDeadline: timestamp('pickup_deadline', { withTimezone: true }),
    accessVersion: integer('access_version').notNull().default(1),
    lastStatusAt: timestamp('last_status_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: orderActor('cancelled_by'),
    cancelReason: cancelReason('cancel_reason'),
    refundStatus: refundStatus('refund_status').notNull().default('none'),
    // Reintentos del reembolso (D9): hasta 8 con espera creciente.
    refundAttempts: smallint('refund_attempts').notNull().default(0),
    refundNextAttemptAt: timestamp('refund_next_attempt_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('orders_in_clinic_pickup', sql`${t.paymentMethod} <> 'in_clinic' or ${t.shippingKind} = 'clinic_pickup'`),
    check(
      'orders_amounts',
      sql`${t.subtotalCents} >= 0 and ${t.discountCents} >= 0 and ${t.totalCents} >= 0 and ${t.vatCents} >= 0 and ${t.shippingCostCents} >= 0`,
    ),
    check('orders_total', sql`${t.totalCents} = ${t.subtotalCents} - ${t.discountCents} + ${t.shippingCostCents}`),
    check('orders_vat_rate', sql`${t.shippingVatRate} in ${vatRatesSql}`),
    check(
      'orders_names_len',
      sql`(${t.firstName} is null or char_length(${t.firstName}) between 1 and 60) and (${t.lastName} is null or char_length(${t.lastName}) between 1 and 60)`,
    ),
    check(
      'orders_address',
      sql`${t.anonymizedAt} is not null or ${t.shippingKind} = 'clinic_pickup' or (${t.addressLine} is not null and ${t.postalCode} is not null and ${t.city} is not null)`,
    ),
    check(
      'orders_contact',
      sql`${t.anonymizedAt} is not null or (${t.contactEmail} is not null and ${t.contactEmailNormalized} is not null and ${t.firstName} is not null and ${t.lastName} is not null)`,
    ),
    check(
      'orders_cancelled',
      sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null and ${t.cancelReason} is not null and ${t.cancelledBy} is not null)`,
    ),
    check('orders_refund_attempts', sql`${t.refundAttempts} between 0 and 8`),
    uniqueIndex('orders_one_pending_card_per_cart')
      .on(t.cartId)
      .where(sql`${t.status} = 'pending_payment' and ${t.paymentMethod} = 'card'`),
    index('orders_customer_idx').on(t.customerId, t.createdAt.desc()),
    index('orders_card_expiry_idx').on(t.status, t.reservationExpiresAt),
    index('orders_pickup_expiry_idx').on(t.status, t.pickupDeadline),
    index('orders_pending_email_idx').on(t.contactEmailNormalized).where(sql`${t.status} = 'pending_payment'`),
    index('orders_refund_pending_idx').on(t.refundNextAttemptAt).where(sql`${t.refundStatus} = 'pending'`),
    // Feature 008 (G6): lista del panel, de más reciente a más antiguo.
    index('orders_created_at_idx').on(t.createdAt.desc()),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    productName: text('product_name').notNull(),
    productSlug: text('product_slug').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    vatRate: smallint('vat_rate').notNull(),
    quantity: smallint('quantity').notNull(),
    discountShareCents: integer('discount_share_cents').notNull().default(0),
    lineTotalCents: integer('line_total_cents').notNull(),
    vatCents: integer('vat_cents').notNull(),
    position: smallint('position').notNull().default(0),
  },
  (t) => [
    check('order_items_price', sql`${t.unitPriceCents} > 0`),
    check('order_items_quantity', sql`${t.quantity} between 1 and 99`),
    check('order_items_vat_rate', sql`${t.vatRate} in ${vatRatesSql}`),
    check(
      'order_items_amounts',
      sql`${t.discountShareCents} >= 0 and ${t.lineTotalCents} >= 0 and ${t.vatCents} >= 0`,
    ),
    check('order_items_total', sql`${t.lineTotalCents} = ${t.unitPriceCents} * ${t.quantity} - ${t.discountShareCents}`),
    index('order_items_order_idx').on(t.orderId, t.position),
  ],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status').notNull(),
    actor: orderActor('actor').notNull(),
    // Feature 008 (G9): quién hizo el cambio desde el panel. Nulo desde la CLI y en el resto de actores.
    adminId: uuid('admin_id').references(() => customers.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('order_status_history_note_len', sql`${t.note} is null or char_length(${t.note}) <= 200`),
    index('order_status_history_order_idx').on(t.orderId, t.createdAt),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerSessionId: text('provider_session_id').notNull().unique(),
    providerPaymentId: text('provider_payment_id'),
    checkoutUrl: text('checkout_url').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: paymentStatus('status').notNull().default('open'),
    refundId: text('refund_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    check('payments_provider', sql`${t.provider} in ('stripe', 'fake')`),
    check('payments_amount', sql`${t.amountCents} >= 0`),
    uniqueIndex('payments_one_succeeded_per_order').on(t.orderId).where(sql`${t.status} = 'succeeded'`),
    index('payments_order_idx').on(t.orderId),
    index('payments_open_idx').on(t.createdAt).where(sql`${t.status} = 'open'`),
  ],
);

export const paymentEvents = pgTable(
  'payment_events',
  {
    providerEventId: text('provider_event_id').primaryKey(),
    provider: text('provider').notNull(),
    type: text('type').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    result: text('result'),
  },
  (t) => [
    check('payment_events_result', sql`${t.result} is null or ${t.result} in ('ok', 'ignored', 'error')`),
    index('payment_events_received_idx').on(t.receivedAt),
  ],
);

// ---------- Consejos de salud y boletín (feature 006, data-model.md) ----------

export const postKind = pgEnum('post_kind', ['article', 'news']);
export const newsletterStatus = pgEnum('newsletter_status', ['pending', 'confirmed']);
export const newsletterSource = pgEnum('newsletter_source', ['form', 'account']);
export const newsletterUnsubscribeReason = pgEnum('newsletter_unsubscribe_reason', [
  'link',
  'one_click',
  'account',
  'account_deleted',
]);

export const postCategories = pgTable(
  'post_categories',
  {
    key: text('key').primaryKey(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('post_categories_key_format', sql`${t.key} ~ '^[a-z][a-z0-9-]{0,31}$'`),
    check('post_categories_label_len', sql`char_length(${t.label}) between 1 and 40`),
  ],
);

export const posts = pgTable(
  'posts',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    kind: postKind('kind').notNull(),
    categoryKey: text('category_key').references(() => postCategories.key, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    title: text('title').notNull(),
    lead: text('lead').notNull(),
    bodyMd: text('body_md').notNull(),
    image: text('image'),
    imageAlt: text('image_alt'),
    metaDescription: text('meta_description').notNull(),
    searchText: text('search_text').notNull(),
    published: published(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    check('posts_slug', sql`${t.slug} ~ '^[a-z0-9-]{1,80}$'`),
    check('posts_category_required', sql`${t.kind} = 'news' or ${t.categoryKey} is not null`),
    check('posts_title_len', sql`char_length(${t.title}) between 1 and 120`),
    check('posts_lead_len', sql`char_length(${t.lead}) between 1 and 400`),
    check('posts_body_len', sql`char_length(${t.bodyMd}) <= 40000`),
    check('posts_image_alt', sql`${t.image} is null or char_length(coalesce(${t.imageAlt}, '')) > 0`),
    check('posts_meta_description_len', sql`char_length(${t.metaDescription}) between 1 and 160`),
    index('posts_kind_idx').on(t.kind, t.publishedAt.desc()).where(sql`${t.published}`),
    index('posts_category_idx').on(t.categoryKey, t.publishedAt.desc()).where(sql`${t.published}`),
  ],
);

export const newsletterSubscriptions = pgTable(
  'newsletter_subscriptions',
  {
    id: id(),
    email: text('email').notNull().unique(),
    status: newsletterStatus('status').notNull(),
    source: newsletterSource('source').notNull(),
    customerId: uuid('customer_id')
      .unique()
      .references(() => customers.id, { onDelete: 'set null' }),
    policyVersion: text('policy_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmTokenHash: text('confirm_token_hash').unique(),
    confirmExpiresAt: timestamp('confirm_expires_at', { withTimezone: true }),
    confirmSentAt: timestamp('confirm_sent_at', { withTimezone: true }),
  },
  (t) => [
    check('newsletter_email_len', sql`char_length(${t.email}) between 3 and 254`),
    check('newsletter_confirmed_at', sql`(${t.status} = 'confirmed') = (${t.confirmedAt} is not null)`),
    index('newsletter_pending_created_idx').on(t.createdAt).where(sql`${t.status} = 'pending'`),
  ],
);

export const newsletterUnsubscribeRecords = pgTable(
  'newsletter_unsubscribe_records',
  {
    id: id(),
    emailHmac: text('email_hmac').notNull(),
    source: newsletterSource('source').notNull(),
    policyVersion: text('policy_version').notNull(),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }).notNull().defaultNow(),
    reason: newsletterUnsubscribeReason('reason').notNull(),
  },
  (t) => [
    index('newsletter_unsub_at_idx').on(t.unsubscribedAt),
    index('newsletter_unsub_hmac_idx').on(t.emailHmac),
  ],
);

export const newsletterSettings = pgTable(
  'newsletter_settings',
  {
    id: smallint('id').primaryKey().default(1),
    enabled: boolean('enabled').notNull(),
    title: text('title').notNull(),
    text: text('text').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('newsletter_settings_singleton', sql`${t.id} = 1`),
    check('newsletter_settings_title_len', sql`char_length(${t.title}) between 1 and 80`),
    check('newsletter_settings_text_len', sql`char_length(${t.text}) between 1 and 240`),
  ],
);

// ---------- Panel de la tienda (feature 008, data-model.md) ----------

export const stockMovementReason = pgEnum('stock_movement_reason', [
  'initial',
  'restock',
  'count',
  'damage',
  'other',
  'order_reserved',
  'order_released',
  'content_load',
]);

/** Historial del stock disponible (G5): cada cambio de `products.stock` escribe una fila. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    delta: integer('delta').notNull(),
    reason: stockMovementReason('reason').notNull(),
    stockAfter: integer('stock_after').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    adminId: uuid('admin_id').references(() => customers.id, { onDelete: 'set null' }),
    note: varchar('note', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('stock_movements_delta', sql`${t.delta} <> 0 or ${t.reason} = 'initial'`),
    check('stock_movements_stock_after', sql`${t.stockAfter} >= 0`),
    index('stock_movements_product_idx').on(t.productId, t.createdAt.desc()),
  ],
);
