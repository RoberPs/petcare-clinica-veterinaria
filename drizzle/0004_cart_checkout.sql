-- Feature 005: carrito y pago (data-model.md). Generada con drizzle-kit: incluye ALTER TYPE de outbox_kind
-- y legal_kind, la secuencia order_number_seq y los índices únicos parciales de D10 y del pago.

CREATE TYPE "public"."cancel_reason" AS ENUM('customer', 'expired', 'replaced', 'stock_unavailable', 'clinic', 'account_deleted');--> statement-breakpoint
CREATE TYPE "public"."cart_kind" AS ENUM('main', 'direct');--> statement-breakpoint
CREATE TYPE "public"."discount_kind" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."order_actor" AS ENUM('customer', 'system', 'clinic', 'gateway');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'preparing', 'shipped', 'ready_for_pickup', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'in_clinic');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('open', 'succeeded', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('none', 'pending', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('held', 'committed', 'released');--> statement-breakpoint
CREATE TYPE "public"."shipping_kind" AS ENUM('home_delivery', 'clinic_pickup');--> statement-breakpoint
ALTER TYPE "public"."legal_kind" ADD VALUE 'condiciones-venta';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'order_confirmed';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'order_received';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'order_cancelled';--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'clinic_order';--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "cart_items" (
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" smallint NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_id_product_id_pk" PRIMARY KEY("cart_id","product_id"),
	CONSTRAINT "cart_items_quantity" CHECK ("cart_items"."quantity" between 1 and 99),
	CONSTRAINT "cart_items_price" CHECK ("cart_items"."unit_price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "cart_kind" DEFAULT 'main' NOT NULL,
	"customer_id" uuid,
	"token_hash" text,
	"discount_code_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_customer_kind" UNIQUE("customer_id","kind"),
	CONSTRAINT "carts_token_kind" UNIQUE("token_hash","kind"),
	CONSTRAINT "carts_owner" CHECK (num_nonnulls("carts"."customer_id", "carts"."token_hash") = 1),
	CONSTRAINT "carts_direct_no_discount" CHECK ("carts"."kind" = 'main' or "carts"."discount_code_id" is null)
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal_cents" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_uses" integer,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "discount_codes_code" CHECK ("discount_codes"."code" ~ '^[A-Z0-9]{3,20}$'),
	CONSTRAINT "discount_codes_value" CHECK (("discount_codes"."kind" = 'percent' and "discount_codes"."value" between 1 and 100) or ("discount_codes"."kind" = 'fixed' and "discount_codes"."value" > 0)),
	CONSTRAINT "discount_codes_min_subtotal" CHECK ("discount_codes"."min_subtotal_cents" is null or "discount_codes"."min_subtotal_cents" >= 0),
	CONSTRAINT "discount_codes_range" CHECK ("discount_codes"."starts_at" is null or "discount_codes"."ends_at" is null or "discount_codes"."ends_at" > "discount_codes"."starts_at"),
	CONSTRAINT "discount_codes_max_uses" CHECK ("discount_codes"."max_uses" is null or "discount_codes"."max_uses" > 0),
	CONSTRAINT "discount_codes_uses" CHECK ("discount_codes"."uses_count" >= 0 and ("discount_codes"."max_uses" is null or "discount_codes"."uses_count" <= "discount_codes"."max_uses"))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"product_slug" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"vat_rate" smallint NOT NULL,
	"quantity" smallint NOT NULL,
	"discount_share_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer NOT NULL,
	"vat_cents" integer NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "order_items_price" CHECK ("order_items"."unit_price_cents" > 0),
	CONSTRAINT "order_items_quantity" CHECK ("order_items"."quantity" between 1 and 99),
	CONSTRAINT "order_items_vat_rate" CHECK ("order_items"."vat_rate" in (0, 4, 10, 21)),
	CONSTRAINT "order_items_amounts" CHECK ("order_items"."discount_share_cents" >= 0 and "order_items"."line_total_cents" >= 0 and "order_items"."vat_cents" >= 0),
	CONSTRAINT "order_items_total" CHECK ("order_items"."line_total_cents" = "order_items"."unit_price_cents" * "order_items"."quantity" - "order_items"."discount_share_cents")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor" "order_actor" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_status_history_note_len" CHECK ("order_status_history"."note" is null or char_length("order_status_history"."note") <= 200)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"submission_id" uuid NOT NULL,
	"customer_id" uuid,
	"cart_id" uuid,
	"checkout_fingerprint" text NOT NULL,
	"contact_email" text,
	"contact_email_normalized" text,
	"first_name" text,
	"last_name" text,
	"address_line" text,
	"postal_code" text,
	"city" text,
	"shipping_method_code" text NOT NULL,
	"shipping_name" text NOT NULL,
	"shipping_kind" "shipping_kind" NOT NULL,
	"shipping_cost_cents" integer NOT NULL,
	"shipping_vat_rate" smallint NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"discount_code" text,
	"discount_code_id" uuid,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"vat_cents" integer NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"reservation_status" "reservation_status" DEFAULT 'held' NOT NULL,
	"reservation_expires_at" timestamp with time zone,
	"pickup_deadline" timestamp with time zone,
	"access_version" integer DEFAULT 1 NOT NULL,
	"last_status_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" "order_actor",
	"cancel_reason" "cancel_reason",
	"refund_status" "refund_status" DEFAULT 'none' NOT NULL,
	"refund_attempts" smallint DEFAULT 0 NOT NULL,
	"refund_next_attempt_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "orders_in_clinic_pickup" CHECK ("orders"."payment_method" <> 'in_clinic' or "orders"."shipping_kind" = 'clinic_pickup'),
	CONSTRAINT "orders_amounts" CHECK ("orders"."subtotal_cents" >= 0 and "orders"."discount_cents" >= 0 and "orders"."total_cents" >= 0 and "orders"."vat_cents" >= 0 and "orders"."shipping_cost_cents" >= 0),
	CONSTRAINT "orders_total" CHECK ("orders"."total_cents" = "orders"."subtotal_cents" - "orders"."discount_cents" + "orders"."shipping_cost_cents"),
	CONSTRAINT "orders_vat_rate" CHECK ("orders"."shipping_vat_rate" in (0, 4, 10, 21)),
	CONSTRAINT "orders_names_len" CHECK (("orders"."first_name" is null or char_length("orders"."first_name") between 1 and 60) and ("orders"."last_name" is null or char_length("orders"."last_name") between 1 and 60)),
	CONSTRAINT "orders_address" CHECK ("orders"."anonymized_at" is not null or "orders"."shipping_kind" = 'clinic_pickup' or ("orders"."address_line" is not null and "orders"."postal_code" is not null and "orders"."city" is not null)),
	CONSTRAINT "orders_contact" CHECK ("orders"."anonymized_at" is not null or ("orders"."contact_email" is not null and "orders"."contact_email_normalized" is not null and "orders"."first_name" is not null and "orders"."last_name" is not null)),
	CONSTRAINT "orders_cancelled" CHECK (("orders"."status" = 'cancelled') = ("orders"."cancelled_at" is not null and "orders"."cancel_reason" is not null and "orders"."cancelled_by" is not null)),
	CONSTRAINT "orders_refund_attempts" CHECK ("orders"."refund_attempts" between 0 and 8)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"provider_event_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"result" text,
	CONSTRAINT "payment_events_result" CHECK ("payment_events"."result" is null or "payment_events"."result" in ('ok', 'ignored', 'error'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_session_id" text NOT NULL,
	"provider_payment_id" text,
	"checkout_url" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "payment_status" DEFAULT 'open' NOT NULL,
	"refund_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_session_id_unique" UNIQUE("provider_session_id"),
	CONSTRAINT "payments_provider" CHECK ("payments"."provider" in ('stripe', 'fake')),
	CONSTRAINT "payments_amount" CHECK ("payments"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shipping_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" "shipping_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate" smallint DEFAULT 21 NOT NULL,
	"postal_prefixes" text[],
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_methods_code_unique" UNIQUE("code"),
	CONSTRAINT "shipping_methods_code" CHECK ("shipping_methods"."code" ~ '^[a-z0-9-]{1,40}$'),
	CONSTRAINT "shipping_methods_name_len" CHECK (char_length("shipping_methods"."name") between 1 and 60),
	CONSTRAINT "shipping_methods_description_len" CHECK (char_length("shipping_methods"."description") between 1 and 160),
	CONSTRAINT "shipping_methods_cost" CHECK ("shipping_methods"."cost_cents" >= 0),
	CONSTRAINT "shipping_methods_vat_rate" CHECK ("shipping_methods"."vat_rate" in (0, 4, 10, 21)),
	CONSTRAINT "shipping_methods_prefixes" CHECK ("shipping_methods"."postal_prefixes" is null or "shipping_methods"."kind" = 'home_delivery')
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "card_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "in_clinic_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "reservation_minutes" smallint DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "pickup_days" smallint DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "cart_retention_days" smallint DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "max_qty_per_line" smallint DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "max_pending_per_email" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "max_pending_per_customer" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "order_prefix" text DEFAULT 'PED-' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "guest_link_days" smallint DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_settings" ADD COLUMN "checkout_notice_text" text;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carts_guest_updated_idx" ON "carts" USING btree ("updated_at") WHERE "carts"."token_hash" is not null;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_pending_card_per_cart" ON "orders" USING btree ("cart_id") WHERE "orders"."status" = 'pending_payment' and "orders"."payment_method" = 'card';--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_card_expiry_idx" ON "orders" USING btree ("status","reservation_expires_at");--> statement-breakpoint
CREATE INDEX "orders_pickup_expiry_idx" ON "orders" USING btree ("status","pickup_deadline");--> statement-breakpoint
CREATE INDEX "orders_pending_email_idx" ON "orders" USING btree ("contact_email_normalized") WHERE "orders"."status" = 'pending_payment';--> statement-breakpoint
CREATE INDEX "orders_refund_pending_idx" ON "orders" USING btree ("refund_next_attempt_at") WHERE "orders"."refund_status" = 'pending';--> statement-breakpoint
CREATE INDEX "payment_events_received_idx" ON "payment_events" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_succeeded_per_order" ON "payments" USING btree ("order_id") WHERE "payments"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_open_idx" ON "payments" USING btree ("created_at") WHERE "payments"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_methods_one_pickup" ON "shipping_methods" USING btree ("kind") WHERE "shipping_methods"."kind" = 'clinic_pickup' and "shipping_methods"."enabled";--> statement-breakpoint
CREATE INDEX "shipping_methods_order_idx" ON "shipping_methods" USING btree ("enabled","position");--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_order_idx" ON "email_outbox" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_reservation" CHECK ("shop_settings"."reservation_minutes" between 30 and 120);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_pickup_days" CHECK ("shop_settings"."pickup_days" between 1 and 30);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_cart_retention" CHECK ("shop_settings"."cart_retention_days" between 1 and 90);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_max_qty" CHECK ("shop_settings"."max_qty_per_line" between 1 and 99);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_pending_email" CHECK ("shop_settings"."max_pending_per_email" between 1 and 10);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_pending_customer" CHECK ("shop_settings"."max_pending_per_customer" between 1 and 10);--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_order_prefix" CHECK ("shop_settings"."order_prefix" ~ '^[A-Z0-9-]{1,6}$');--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_guest_link" CHECK ("shop_settings"."guest_link_days" between 7 and 365);