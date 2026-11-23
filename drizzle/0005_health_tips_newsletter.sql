-- Feature 006: consejos de salud y boletín (data-model.md). Generada con drizzle-kit (ALTER TYPE de
-- legal_kind y outbox_kind, CHECK e índices parciales) y completada a mano con el backfill de E12.
CREATE TYPE "public"."newsletter_source" AS ENUM('form', 'account');--> statement-breakpoint
CREATE TYPE "public"."newsletter_status" AS ENUM('pending', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."newsletter_unsubscribe_reason" AS ENUM('link', 'one_click', 'account', 'account_deleted');--> statement-breakpoint
CREATE TYPE "public"."post_kind" AS ENUM('article', 'news');--> statement-breakpoint
ALTER TYPE "public"."legal_kind" ADD VALUE 'boletin';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'newsletter_confirm';--> statement-breakpoint
CREATE TABLE "newsletter_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_settings_singleton" CHECK ("newsletter_settings"."id" = 1),
	CONSTRAINT "newsletter_settings_title_len" CHECK (char_length("newsletter_settings"."title") between 1 and 80),
	CONSTRAINT "newsletter_settings_text_len" CHECK (char_length("newsletter_settings"."text") between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"status" "newsletter_status" NOT NULL,
	"source" "newsletter_source" NOT NULL,
	"customer_id" uuid,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirm_token_hash" text,
	"confirm_expires_at" timestamp with time zone,
	"confirm_sent_at" timestamp with time zone,
	CONSTRAINT "newsletter_subscriptions_email_unique" UNIQUE("email"),
	CONSTRAINT "newsletter_subscriptions_customer_id_unique" UNIQUE("customer_id"),
	CONSTRAINT "newsletter_subscriptions_confirm_token_hash_unique" UNIQUE("confirm_token_hash"),
	CONSTRAINT "newsletter_email_len" CHECK (char_length("newsletter_subscriptions"."email") between 3 and 254),
	CONSTRAINT "newsletter_confirmed_at" CHECK (("newsletter_subscriptions"."status" = 'confirmed') = ("newsletter_subscriptions"."confirmed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "newsletter_unsubscribe_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hmac" text NOT NULL,
	"source" "newsletter_source" NOT NULL,
	"policy_version" text NOT NULL,
	"subscribed_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" "newsletter_unsubscribe_reason" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_categories" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_categories_key_format" CHECK ("post_categories"."key" ~ '^[a-z][a-z0-9-]{0,31}$'),
	CONSTRAINT "post_categories_label_len" CHECK (char_length("post_categories"."label") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" "post_kind" NOT NULL,
	"category_key" text,
	"title" text NOT NULL,
	"lead" text NOT NULL,
	"body_md" text NOT NULL,
	"image" text,
	"image_alt" text,
	"meta_description" text NOT NULL,
	"search_text" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_slug_unique" UNIQUE("slug"),
	CONSTRAINT "posts_slug" CHECK ("posts"."slug" ~ '^[a-z0-9-]{1,80}$'),
	CONSTRAINT "posts_category_required" CHECK ("posts"."kind" = 'news' or "posts"."category_key" is not null),
	CONSTRAINT "posts_title_len" CHECK (char_length("posts"."title") between 1 and 120),
	CONSTRAINT "posts_lead_len" CHECK (char_length("posts"."lead") between 1 and 400),
	CONSTRAINT "posts_body_len" CHECK (char_length("posts"."body_md") <= 40000),
	CONSTRAINT "posts_image_alt" CHECK ("posts"."image" is null or char_length(coalesce("posts"."image_alt", '')) > 0),
	CONSTRAINT "posts_meta_description_len" CHECK (char_length("posts"."meta_description") between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "processed_submissions" DROP CONSTRAINT "processed_submissions_scope";--> statement-breakpoint
ALTER TABLE "newsletter_subscriptions" ADD CONSTRAINT "newsletter_subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_key_post_categories_key_fk" FOREIGN KEY ("category_key") REFERENCES "public"."post_categories"("key") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "newsletter_pending_created_idx" ON "newsletter_subscriptions" USING btree ("created_at") WHERE "newsletter_subscriptions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "newsletter_unsub_at_idx" ON "newsletter_unsubscribe_records" USING btree ("unsubscribed_at");--> statement-breakpoint
CREATE INDEX "newsletter_unsub_hmac_idx" ON "newsletter_unsubscribe_records" USING btree ("email_hmac");--> statement-breakpoint
CREATE INDEX "posts_kind_idx" ON "posts" USING btree ("kind","published_at" DESC NULLS LAST) WHERE "posts"."published";--> statement-breakpoint
CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category_key","published_at" DESC NULLS LAST) WHERE "posts"."published";--> statement-breakpoint
ALTER TABLE "processed_submissions" ADD CONSTRAINT "processed_submissions_scope" CHECK ("processed_submissions"."scope" in ('register', 'pet_create', 'newsletter'));--> statement-breakpoint
-- Backfill (E12): los clientes que ya tenían la preferencia y el correo verificado pasan a la lista.
INSERT INTO "newsletter_subscriptions" ("id", "email", "status", "source", "customer_id", "policy_version", "created_at", "confirmed_at")
SELECT gen_random_uuid(), lower(c."email"), 'confirmed', 'account', c."id", 'previa',
       coalesce(c."marketing_opt_in_changed_at", c."created_at"), coalesce(c."marketing_opt_in_changed_at", c."created_at")
FROM "customers" c
WHERE c."marketing_opt_in" AND c."email_verified_at" IS NOT NULL
ON CONFLICT DO NOTHING;
