CREATE TYPE "public"."appointment_event_actor" AS ENUM('customer', 'guest_link', 'clinic_link', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."appointment_event_kind" AS ENUM('created', 'rescheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."schedule_block_kind" AS ENUM('once', 'weekly');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "appointment_event_kind" NOT NULL,
	"actor" "appointment_event_actor" NOT NULL,
	"admin_id" uuid,
	"from_starts_at" timestamp with time zone,
	"to_starts_at" timestamp with time zone,
	"from_staff_id" uuid,
	"to_staff_id" uuid,
	"note" text,
	CONSTRAINT "appointment_events_note_len" CHECK ("appointment_events"."note" is null or char_length("appointment_events"."note") <= 300),
	CONSTRAINT "appointment_events_admin" CHECK ("appointment_events"."admin_id" is null or "appointment_events"."actor" = 'admin')
);
--> statement-breakpoint
CREATE TABLE "schedule_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_member_id" uuid,
	"kind" "schedule_block_kind" NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"from_date" date,
	"until_date" date,
	"weekdays" smallint[],
	"start_time" time,
	"end_time" time,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_blocks_reason_len" CHECK (char_length("schedule_blocks"."reason") between 1 and 120),
	CONSTRAINT "schedule_blocks_once" CHECK ("schedule_blocks"."kind" <> 'once' or ("schedule_blocks"."starts_at" is not null and "schedule_blocks"."ends_at" is not null and "schedule_blocks"."ends_at" > "schedule_blocks"."starts_at"
        and "schedule_blocks"."from_date" is null and "schedule_blocks"."until_date" is null and "schedule_blocks"."weekdays" is null and "schedule_blocks"."start_time" is null and "schedule_blocks"."end_time" is null)),
	CONSTRAINT "schedule_blocks_weekly" CHECK ("schedule_blocks"."kind" <> 'weekly' or ("schedule_blocks"."from_date" is not null and "schedule_blocks"."until_date" is not null and "schedule_blocks"."until_date" >= "schedule_blocks"."from_date"
        and "schedule_blocks"."until_date" - "schedule_blocks"."from_date" <= 366
        and "schedule_blocks"."weekdays" is not null and cardinality("schedule_blocks"."weekdays") > 0 and "schedule_blocks"."weekdays" <@ array[1,2,3,4,5,6,7]::smallint[]
        and "schedule_blocks"."start_time" is not null and "schedule_blocks"."end_time" is not null and "schedule_blocks"."end_time" > "schedule_blocks"."start_time"
        and "schedule_blocks"."starts_at" is null and "schedule_blocks"."ends_at" is null))
);
--> statement-breakpoint
CREATE TABLE "staff_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_member_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "staff_hours_weekday" CHECK ("staff_hours"."weekday" between 1 and 7),
	CONSTRAINT "staff_hours_range" CHECK ("staff_hours"."closes_at" > "staff_hours"."opens_at")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "bookable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "booking_position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_customers_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_admin_id_customers_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_from_staff_id_team_members_id_fk" FOREIGN KEY ("from_staff_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_to_staff_id_team_members_id_fk" FOREIGN KEY ("to_staff_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_created_by_customers_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_entity_idx" ON "admin_audit_log" USING btree ("entity_type","entity_id","at");--> statement-breakpoint
CREATE INDEX "appointment_events_appointment_idx" ON "appointment_events" USING btree ("appointment_id","at");--> statement-breakpoint
CREATE INDEX "schedule_blocks_member_idx" ON "schedule_blocks" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX "schedule_blocks_once_idx" ON "schedule_blocks" USING btree ("kind","ends_at");--> statement-breakpoint
CREATE INDEX "schedule_blocks_weekly_idx" ON "schedule_blocks" USING btree ("kind","until_date");--> statement-breakpoint
CREATE INDEX "staff_hours_member_idx" ON "staff_hours" USING btree ("team_member_id","weekday");--> statement-breakpoint
CREATE INDEX "appointments_starts_at_idx" ON "appointments" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_services_name_lower_uq" ON "booking_services" USING btree (lower("name"));--> statement-breakpoint
-- Escrito a mano (F6): tramos del mismo veterinario y día sin solapar. btree_gist ya existe (0002).
ALTER TABLE "staff_hours" ADD CONSTRAINT "staff_hours_no_overlap" EXCLUDE USING gist (
	"team_member_id" WITH =,
	"weekday" WITH =,
	tsrange('2000-01-01'::date + "opens_at", '2000-01-01'::date + "closes_at", '[)') WITH &&
);--> statement-breakpoint
-- Backfill (F5): reservable quien ya atiende algún servicio; orden de la reserva = orden del equipo.
UPDATE "team_members" SET "bookable" = true
	WHERE "id" IN (SELECT DISTINCT "team_member_id" FROM "booking_service_staff");--> statement-breakpoint
UPDATE "team_members" SET "booking_position" = "position";--> statement-breakpoint
-- Backfill (F6): cada veterinario reservable empieza con el horario de la clínica.
INSERT INTO "staff_hours" ("team_member_id", "weekday", "opens_at", "closes_at")
	SELECT tm."id", oh."weekday", oh."opens_at", oh."closes_at"
	FROM "team_members" tm CROSS JOIN "opening_hours" oh
	WHERE tm."bookable";--> statement-breakpoint
-- Backfill (F12): un "created" por cita y un "cancelled" por cada cita cancelada.
INSERT INTO "appointment_events" ("appointment_id", "at", "kind", "actor")
	SELECT a."id", a."created_at", 'created',
		(CASE WHEN a."booked_as" = 'customer' THEN 'customer' ELSE 'guest_link' END)::"appointment_event_actor"
	FROM "appointments" a;--> statement-breakpoint
INSERT INTO "appointment_events" ("appointment_id", "at", "kind", "actor")
	SELECT a."id", a."cancelled_at", 'cancelled',
		(CASE a."cancelled_by"
			WHEN 'clinic' THEN 'clinic_link'
			WHEN 'system' THEN 'system'
			WHEN 'customer' THEN (CASE WHEN a."booked_as" = 'customer' THEN 'customer' ELSE 'guest_link' END)
		END)::"appointment_event_actor"
	FROM "appointments" a
	WHERE a."status" = 'cancelled';