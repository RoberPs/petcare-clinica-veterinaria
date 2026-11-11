-- Extensión trusted (PostgreSQL 13+): la crea el dueño de la base de datos sin superusuario (B2).
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TYPE "public"."appointment_actor" AS ENUM('customer', 'clinic', 'system');--> statement-breakpoint
CREATE TYPE "public"."appointment_booked_as" AS ENUM('guest', 'customer');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'appointment_confirmed';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'appointment_changed';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'appointment_cancelled';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'appointment_reminder';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'clinic_appointment';--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"booking_service_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'confirmed' NOT NULL,
	"cancelled_by" "appointment_actor",
	"cancelled_at" timestamp with time zone,
	"booked_as" "appointment_booked_as" NOT NULL,
	"customer_id" uuid,
	"pet_id" uuid,
	"pet_name" text NOT NULL,
	"pet_species_label" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_email_normalized" text,
	"contact_phone" text,
	"reason" text,
	"privacy_accepted_at" timestamp with time zone NOT NULL,
	"privacy_version" text NOT NULL,
	"manage_version" integer DEFAULT 1 NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "appointments_range" CHECK ("appointments"."ends_at" > "appointments"."starts_at"),
	CONSTRAINT "appointments_cancelled" CHECK (("appointments"."cancelled_by" is not null) = ("appointments"."status" = 'cancelled') and ("appointments"."cancelled_at" is not null) = ("appointments"."status" = 'cancelled')),
	CONSTRAINT "appointments_pet_name_len" CHECK (char_length("appointments"."pet_name") between 1 and 40),
	CONSTRAINT "appointments_contact_name_len" CHECK ("appointments"."contact_name" is null or char_length("appointments"."contact_name") between 2 and 100),
	CONSTRAINT "appointments_contact_email_len" CHECK ("appointments"."contact_email" is null or char_length("appointments"."contact_email") <= 254),
	CONSTRAINT "appointments_contact_phone_len" CHECK ("appointments"."contact_phone" is null or char_length("appointments"."contact_phone") between 9 and 20),
	CONSTRAINT "appointments_reason_len" CHECK ("appointments"."reason" is null or char_length("appointments"."reason") <= 500),
	CONSTRAINT "appointments_anonymized" CHECK (("appointments"."anonymized_at" is not null) = ("appointments"."contact_name" is null and "appointments"."contact_email" is null and "appointments"."contact_email_normalized" is null)),
	CONSTRAINT "appointments_anonymized_rest" CHECK ("appointments"."anonymized_at" is null or ("appointments"."reason" is null and "appointments"."contact_phone" is null))
);
--> statement-breakpoint
CREATE TABLE "booking_service_staff" (
	"booking_service_id" uuid NOT NULL,
	"team_member_id" uuid NOT NULL,
	CONSTRAINT "booking_service_staff_booking_service_id_team_member_id_pk" PRIMARY KEY("booking_service_id","team_member_id")
);
--> statement-breakpoint
CREATE TABLE "booking_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"service_id" uuid,
	"position" smallint DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_services_slug_unique" UNIQUE("slug"),
	CONSTRAINT "booking_services_slug" CHECK ("booking_services"."slug" ~ '^[a-z0-9-]{1,60}$'),
	CONSTRAINT "booking_services_name_len" CHECK (char_length("booking_services"."name") between 1 and 80),
	CONSTRAINT "booking_services_duration" CHECK ("booking_services"."duration_minutes" between 5 and 480 and "booking_services"."duration_minutes" % 5 = 0)
);
--> statement-breakpoint
CREATE TABLE "booking_settings" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"slot_step_minutes" smallint DEFAULT 30 NOT NULL,
	"min_lead_minutes" integer DEFAULT 120 NOT NULL,
	"horizon_days" smallint DEFAULT 60 NOT NULL,
	"change_cutoff_hours" smallint DEFAULT 24 NOT NULL,
	"max_active_per_email" smallint DEFAULT 3 NOT NULL,
	"max_active_per_customer" smallint DEFAULT 9 NOT NULL,
	"reminder_hours_before" smallint DEFAULT 24 NOT NULL,
	"retention_months" smallint DEFAULT 12 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_settings_singleton" CHECK ("booking_settings"."singleton"),
	CONSTRAINT "booking_settings_step" CHECK ("booking_settings"."slot_step_minutes" between 5 and 120),
	CONSTRAINT "booking_settings_lead" CHECK ("booking_settings"."min_lead_minutes" between 0 and 10080),
	CONSTRAINT "booking_settings_horizon" CHECK ("booking_settings"."horizon_days" between 1 and 365),
	CONSTRAINT "booking_settings_cutoff" CHECK ("booking_settings"."change_cutoff_hours" between 0 and 168),
	CONSTRAINT "booking_settings_per_email" CHECK ("booking_settings"."max_active_per_email" between 1 and 20),
	CONSTRAINT "booking_settings_per_customer" CHECK ("booking_settings"."max_active_per_customer" between 1 and 50),
	CONSTRAINT "booking_settings_reminder" CHECK ("booking_settings"."reminder_hours_before" between 0 and 72),
	CONSTRAINT "booking_settings_retention" CHECK ("booking_settings"."retention_months" between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "appointment_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_booking_service_id_booking_services_id_fk" FOREIGN KEY ("booking_service_id") REFERENCES "public"."booking_services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_service_staff" ADD CONSTRAINT "booking_service_staff_booking_service_id_booking_services_id_fk" FOREIGN KEY ("booking_service_id") REFERENCES "public"."booking_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_service_staff" ADD CONSTRAINT "booking_service_staff_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_staff_start_idx" ON "appointments" USING btree ("team_member_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_customer_idx" ON "appointments" USING btree ("customer_id","starts_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "appointments_email_active_idx" ON "appointments" USING btree ("contact_email_normalized") WHERE "appointments"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "appointments_guest_retention_idx" ON "appointments" USING btree ("starts_at") WHERE "appointments"."booked_as" = 'guest' and "appointments"."anonymized_at" is null;--> statement-breakpoint
CREATE INDEX "appointments_reminder_idx" ON "appointments" USING btree ("starts_at") WHERE "appointments"."status" = 'confirmed' and "appointments"."reminder_sent_at" is null;--> statement-breakpoint
CREATE INDEX "booking_services_order_idx" ON "booking_services" USING btree ("published","position");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_appointment_idx" ON "email_outbox" USING btree ("appointment_id");--> statement-breakpoint
-- Sin dobles reservas (B2, SC-002): Drizzle no modela EXCLUDE, así que va escrita a mano.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist ("team_member_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("status" = 'confirmed');
