CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_categories_slug" CHECK ("product_categories"."slug" ~ '^[a-z0-9-]{1,60}$'),
	CONSTRAINT "product_categories_name_len" CHECK (char_length("product_categories"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "product_pet_links" (
	"product_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	CONSTRAINT "product_pet_links_product_id_pet_id_pk" PRIMARY KEY("product_id","pet_id")
);
--> statement-breakpoint
CREATE TABLE "product_pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_pets_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_pets_slug" CHECK ("product_pets"."slug" ~ '^[a-z0-9-]{1,60}$'),
	CONSTRAINT "product_pets_name_len" CHECK (char_length("product_pets"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"search_name" text NOT NULL,
	"short_description" text NOT NULL,
	"description_md" text NOT NULL,
	"ingredients_md" text,
	"usage_md" text,
	"category_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"compare_at_cents" integer,
	"vat_rate" smallint NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"image_path" text,
	"image_alt" text,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_slug" CHECK ("products"."slug" ~ '^[a-z0-9-]{1,80}$'),
	CONSTRAINT "products_name_len" CHECK (char_length("products"."name") between 1 and 120),
	CONSTRAINT "products_short_description_len" CHECK (char_length("products"."short_description") between 1 and 300),
	CONSTRAINT "products_price_positive" CHECK ("products"."price_cents" > 0),
	CONSTRAINT "products_compare_at_positive" CHECK ("products"."compare_at_cents" is null or "products"."compare_at_cents" > 0),
	CONSTRAINT "products_vat_rate" CHECK ("products"."vat_rate" in (0, 4, 10, 21)),
	CONSTRAINT "products_stock_non_negative" CHECK ("products"."stock" >= 0),
	CONSTRAINT "products_image_alt" CHECK ("products"."image_path" is null or char_length(coalesce("products"."image_alt", '')) > 0)
);
--> statement-breakpoint
CREATE TABLE "shop_settings" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"shipping_text" text NOT NULL,
	"page_size" smallint DEFAULT 12 NOT NULL,
	"demo_notice_enabled" boolean DEFAULT false NOT NULL,
	"demo_notice_text" text,
	"meta_description" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_settings_singleton" CHECK ("shop_settings"."singleton"),
	CONSTRAINT "shop_settings_shipping_len" CHECK (char_length("shop_settings"."shipping_text") between 1 and 40),
	CONSTRAINT "shop_settings_page_size" CHECK ("shop_settings"."page_size" between 4 and 48),
	CONSTRAINT "shop_settings_demo_notice" CHECK (not "shop_settings"."demo_notice_enabled" or char_length(coalesce("shop_settings"."demo_notice_text", '')) > 0)
);
--> statement-breakpoint
ALTER TABLE "product_pet_links" ADD CONSTRAINT "product_pet_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_pet_links" ADD CONSTRAINT "product_pet_links_pet_id_product_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."product_pets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_categories_order_idx" ON "product_categories" USING btree ("published","position");--> statement-breakpoint
CREATE INDEX "product_pet_links_pet_idx" ON "product_pet_links" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "product_pets_order_idx" ON "product_pets" USING btree ("published","position");--> statement-breakpoint
CREATE INDEX "products_listing_idx" ON "products" USING btree ("published","category_id");--> statement-breakpoint
CREATE INDEX "products_order_idx" ON "products" USING btree ("published","position");