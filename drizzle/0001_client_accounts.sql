CREATE TYPE "public"."consent_kind" AS ENUM('privacy_terms', 'marketing_opt_in', 'marketing_opt_out');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('verify_email', 'reset_password');--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'verify_email';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'account_exists';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'password_reset';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'password_changed';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'account_deleted';--> statement-breakpoint
CREATE TABLE "account_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"privacy_version" text,
	"terms_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"remember" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"address_line" text,
	"postal_code" text,
	"city" text,
	"province" text,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"marketing_opt_in_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_normalized_unique" UNIQUE("email_normalized"),
	CONSTRAINT "customers_email_len" CHECK (char_length("customers"."email") between 3 and 254),
	CONSTRAINT "customers_first_name_len" CHECK (char_length("customers"."first_name") between 1 and 80),
	CONSTRAINT "customers_last_name_len" CHECK (char_length("customers"."last_name") between 1 and 80),
	CONSTRAINT "customers_phone_len" CHECK ("customers"."phone" is null or char_length("customers"."phone") <= 30),
	CONSTRAINT "customers_address_len" CHECK ("customers"."address_line" is null or char_length("customers"."address_line") <= 120),
	CONSTRAINT "customers_postal_code" CHECK ("customers"."postal_code" is null or "customers"."postal_code" ~ '^[0-9]{5}$'),
	CONSTRAINT "customers_city_len" CHECK ("customers"."city" is null or char_length("customers"."city") <= 80),
	CONSTRAINT "customers_province_len" CHECK ("customers"."province" is null or char_length("customers"."province") <= 80),
	CONSTRAINT "customers_postal_city" CHECK (("customers"."postal_code" is null) = ("customers"."city" is null))
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species_key" text,
	"birth_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pets_name_len" CHECK (char_length("pets"."name") between 1 and 40 and "pets"."name" = btrim("pets"."name"))
);
--> statement-breakpoint
CREATE TABLE "processed_submissions" (
	"submission_id" uuid PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"result_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_submissions_scope" CHECK ("processed_submissions"."scope" in ('register', 'pet_create'))
);
--> statement-breakpoint
CREATE TABLE "species" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" smallint NOT NULL,
	CONSTRAINT "species_key_format" CHECK ("species"."key" ~ '^[a-z][a-z0-9-]{0,31}$' and "species"."key" <> 'other'),
	CONSTRAINT "species_label_len" CHECK (char_length("species"."label") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ALTER COLUMN "contact_message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_species_key_species_key_fk" FOREIGN KEY ("species_key") REFERENCES "public"."species"("key") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "account_tokens_customer_purpose_idx" ON "account_tokens" USING btree ("customer_id","purpose");--> statement-breakpoint
CREATE INDEX "customer_consents_customer_idx" ON "customer_consents" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_sessions_customer_idx" ON "customer_sessions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_sessions_expires_idx" ON "customer_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customers_unverified_idx" ON "customers" USING btree ("created_at") WHERE "customers"."email_verified_at" is null;--> statement-breakpoint
CREATE INDEX "pets_customer_name_idx" ON "pets" USING btree ("customer_id","name");--> statement-breakpoint
CREATE INDEX "processed_submissions_created_idx" ON "processed_submissions" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_customer_idx" ON "email_outbox" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_source" CHECK ("email_outbox"."contact_message_id" is not null or "email_outbox"."payload" is not null or "email_outbox"."status" in ('sent', 'failed', 'skipped_rate_limit'));