CREATE TYPE "public"."legal_kind" AS ENUM('aviso-legal', 'privacidad', 'cookies', 'terminos');--> statement-breakpoint
CREATE TYPE "public"."outbox_kind" AS ENUM('clinic_notification', 'visitor_ack');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed', 'skipped_rate_limit');--> statement-breakpoint
CREATE TYPE "public"."section_key" AS ENUM('reservas', 'tienda', 'carrito', 'consejos', 'cuenta');--> statement-breakpoint
CREATE TABLE "activity_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"value_text" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_stats_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "clinic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"logo_path" text,
	"hero_title" text NOT NULL,
	"hero_text" text NOT NULL,
	"hero_image_path" text,
	"hero_image_alt" text,
	"about_title" text,
	"about_text" text,
	"about_image_path" text,
	"about_image_alt" text,
	"address_line" text NOT NULL,
	"postal_code" text NOT NULL,
	"city" text NOT NULL,
	"province" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"phone_e164" text NOT NULL,
	"phone_display" text NOT NULL,
	"public_email" text,
	"inbox_email" text NOT NULL,
	"response_time_text" text NOT NULL,
	"legal_owner_name" text NOT NULL,
	"legal_owner_tax_id" text,
	"legal_owner_address" text,
	"legal_contact_email" text NOT NULL,
	"demo_banner_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_singleton_unique" UNIQUE("singleton"),
	CONSTRAINT "clinic_singleton" CHECK ("clinic"."singleton"),
	CONSTRAINT "clinic_name_len" CHECK (char_length("clinic"."name") between 1 and 80),
	CONSTRAINT "clinic_hero_len" CHECK (char_length("clinic"."hero_title") <= 120 and char_length("clinic"."hero_text") <= 300),
	CONSTRAINT "clinic_hero_alt" CHECK ("clinic"."hero_image_path" is null or "clinic"."hero_image_alt" is not null),
	CONSTRAINT "clinic_about_alt" CHECK ("clinic"."about_image_path" is null or "clinic"."about_image_alt" is not null)
);
--> statement-breakpoint
CREATE TABLE "closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closures_slug_unique" UNIQUE("slug"),
	CONSTRAINT "closures_range" CHECK ("closures"."starts_on" <= "closures"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text NOT NULL,
	"reason_id" uuid NOT NULL,
	"reason_label" text NOT NULL,
	"message" text NOT NULL,
	"privacy_accepted_at" timestamp with time zone NOT NULL,
	"privacy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	CONSTRAINT "contact_messages_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "contact_name_len" CHECK (char_length("contact_messages"."name") between 1 and 100),
	CONSTRAINT "contact_phone_len" CHECK ("contact_messages"."phone" is null or char_length("contact_messages"."phone") <= 20),
	CONSTRAINT "contact_email_len" CHECK (char_length("contact_messages"."email") <= 254),
	CONSTRAINT "contact_message_len" CHECK (char_length("contact_messages"."message") between 10 and 2000)
);
--> statement-breakpoint
CREATE TABLE "contact_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_reasons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_message_id" uuid NOT NULL,
	"kind" "outbox_kind" NOT NULL,
	"recipient_hash" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error_code" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_message_kind" UNIQUE("contact_message_id","kind"),
	CONSTRAINT "email_outbox_attempts" CHECK ("email_outbox"."attempts" between 0 and 8)
);
--> statement-breakpoint
CREATE TABLE "faq_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faq_topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer_md" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faqs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "faqs_question_len" CHECK (char_length("faqs"."question") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "health_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"text" text NOT NULL,
	"source_label" text NOT NULL,
	"source_url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_notices_slug_unique" UNIQUE("slug"),
	CONSTRAINT "health_notices_https" CHECK ("health_notices"."source_url" like 'https://%')
);
--> statement-breakpoint
CREATE TABLE "legal_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "legal_kind" NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"version" text NOT NULL,
	"updated_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_pages_kind_unique" UNIQUE("kind")
);
--> statement-breakpoint
CREATE TABLE "opening_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "opening_hours_weekday" CHECK ("opening_hours"."weekday" between 1 and 7),
	CONSTRAINT "opening_hours_range" CHECK ("opening_hours"."opens_at" < "opening_hours"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"hit_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"key" "section_key" PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"href" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug"),
	CONSTRAINT "services_name_len" CHECK (char_length("services"."name") between 1 and 80),
	CONSTRAINT "services_description_len" CHECK (char_length("services"."description") between 1 and 600)
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"specialty" text NOT NULL,
	"photo_path" text,
	"photo_alt" text,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_slug_unique" UNIQUE("slug"),
	CONSTRAINT "team_specialty_len" CHECK (char_length("team_members"."specialty") between 1 and 120),
	CONSTRAINT "team_photo_alt" CHECK ("team_members"."photo_path" is null or "team_members"."photo_alt" is not null)
);
--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_reason_id_contact_reasons_id_fk" FOREIGN KEY ("reason_id") REFERENCES "public"."contact_reasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_contact_message_id_contact_messages_id_fk" FOREIGN KEY ("contact_message_id") REFERENCES "public"."contact_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_topic_id_faq_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."faq_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "closures_ends_on_idx" ON "closures" USING btree ("ends_on");--> statement-breakpoint
CREATE INDEX "contact_messages_purge_idx" ON "contact_messages" USING btree ("purge_after");--> statement-breakpoint
CREATE INDEX "email_outbox_pending_idx" ON "email_outbox" USING btree ("next_attempt_at") WHERE "email_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "email_outbox_ack_idx" ON "email_outbox" USING btree ("recipient_hash","created_at");--> statement-breakpoint
CREATE INDEX "faqs_topic_idx" ON "faqs" USING btree ("topic_id","position");--> statement-breakpoint
CREATE INDEX "opening_hours_weekday_idx" ON "opening_hours" USING btree ("weekday","opens_at");--> statement-breakpoint
CREATE INDEX "rate_limit_hits_bucket_idx" ON "rate_limit_hits" USING btree ("bucket","hit_at");--> statement-breakpoint
CREATE INDEX "services_order_idx" ON "services" USING btree ("published","position","slug");--> statement-breakpoint
CREATE INDEX "team_order_idx" ON "team_members" USING btree ("published","position","slug");