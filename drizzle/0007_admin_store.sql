CREATE TYPE "public"."stock_movement_reason" AS ENUM('initial', 'restock', 'count', 'damage', 'other', 'order_reserved', 'order_released', 'content_load');--> statement-breakpoint
ALTER TYPE "public"."outbox_kind" ADD VALUE 'order_status';--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "stock_movement_reason" NOT NULL,
	"stock_after" integer NOT NULL,
	"order_id" uuid,
	"admin_id" uuid,
	"note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_delta" CHECK ("stock_movements"."delta" <> 0 or "stock_movements"."reason" = 'initial'),
	CONSTRAINT "stock_movements_stock_after" CHECK ("stock_movements"."stock_after" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_status_history" ADD COLUMN "admin_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_width" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_height" integer;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_admin_id_customers_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_admin_id_customers_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_image_size" CHECK (("products"."image_width" is null and "products"."image_height" is null) or ("products"."image_width" > 0 and "products"."image_height" > 0));--> statement-breakpoint
-- Backfill (data-model.md): un movimiento "initial" por producto con el stock de hoy, para que el
-- historial de cada producto empiece cuadrado (la suma de movimientos parte de este saldo).
INSERT INTO "stock_movements" ("product_id", "delta", "reason", "stock_after", "note")
SELECT "id", 0, 'initial', "stock", 'Saldo al activar el panel' FROM "products";
