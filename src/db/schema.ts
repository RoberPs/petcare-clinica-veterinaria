import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// Esquema de data-model.md. Ningún campo de contenido tiene un valor por defecto de una clínica concreta.

const id = () => uuid('id').primaryKey().defaultRandom();
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
const position = () => integer('position').notNull().default(0);
const published = () => boolean('published').notNull().default(true);

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

export const legalKind = pgEnum('legal_kind', ['aviso-legal', 'privacidad', 'cookies', 'terminos']);

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
]);
export const outboxStatus = pgEnum('outbox_status', ['pending', 'sent', 'failed', 'skipped_rate_limit']);

/** Correo ya renderizado (A8): solo existe mientras el correo está pendiente. */
export interface OutboxPayload {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
}

export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: id(),
    // Nulo en los correos de cuenta (A8): esos llevan el payload ya renderizado.
    contactMessageId: uuid('contact_message_id').references(() => contactMessages.id, { onDelete: 'cascade' }),
    // Sobrevive al borrado de la cuenta (SET NULL): así se envía el aviso "account_deleted".
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
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
    check('processed_submissions_scope', sql`${t.scope} in ('register', 'pet_create')`),
    index('processed_submissions_created_idx').on(t.createdAt),
  ],
);
