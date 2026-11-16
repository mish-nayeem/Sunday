-- The core tables, so this repo can build SUNDAY's database from nothing
-- (audit MEDIUM-2).
--
-- products, orders, settings, profiles, reviews, expenses, invoices,
-- newsletter_subscribers, contact_messages and wishlist_items were made
-- before supabase/migrations existed (the Base44 import, now in
-- docs/legacy-sql/), and some of their columns were added in the dashboard,
-- so no migration made them. Every later migration assumes they exist.
-- This file is them as the live database has them (Actions → Schema
-- snapshot, 16 Nov 2026): columns, keys, indexes, row level security and
-- policies, plus is_admin() and handle_new_user(), which the first
-- migrations call. It's dated before the first migration so a new database
-- gets it first.
--
-- On the live database it does nothing: products is already there, so it
-- stops at the first line. (The Supabase workflow records it as run there.)
-- On an empty database — a test, a Supabase branch, a restore — it makes
-- them, and the migrations after it change them the way they changed the
-- live ones.

do $baseline$
begin
  if to_regclass('public.products') is not null then
    raise notice 'The core tables are already there (the live database): nothing to do.';
    return;
  end if;

  -- Two helpers the first migrations already call.

  CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
      LANGUAGE "sql" STABLE SECURITY DEFINER
      SET "search_path" TO 'public'
      AS $fn$
    select coalesce(lower(auth.jwt() ->> 'email') = 'sundayclothin@gmail.com', false)
  $fn$;

  CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
      LANGUAGE "plpgsql" SECURITY DEFINER
      AS $fn$
  begin
    insert into public.profiles (id, email, role)
    values (new.id, new.email, 'user');
    return new;
  end;
  $fn$;


  -- The tables, with every column the live database has.

  CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
      "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
      "name" "text" NOT NULL,
      "email" "text" NOT NULL,
      "subject" "text",
      "message" "text" NOT NULL,
      "created_at" timestamp with time zone DEFAULT "now"()
  );

  CREATE TABLE IF NOT EXISTS "public"."expenses" (
      "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
      "title" "text" NOT NULL,
      "amount" numeric NOT NULL,
      "category" "text" DEFAULT 'other'::"text" NOT NULL,
      "date" "date" NOT NULL,
      "notes" "text",
      "created_at" timestamp with time zone DEFAULT "now"(),
      CONSTRAINT "expenses_category_check" CHECK (("category" = ANY (ARRAY['inventory'::"text", 'marketing'::"text", 'operations'::"text", 'shipping'::"text", 'utilities'::"text", 'other'::"text"])))
  );

  CREATE TABLE IF NOT EXISTS "public"."invoices" (
      "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
      "invoice_number" "text" NOT NULL,
      "order_id" "text" NOT NULL,
      "customer_name" "text" NOT NULL,
      "customer_mobile" "text",
      "customer_address" "text",
      "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
      "subtotal" numeric DEFAULT 0,
      "delivery_charge" numeric DEFAULT 0,
      "total" numeric NOT NULL,
      "issue_date" "date" NOT NULL,
      "status" "text" DEFAULT 'issued'::"text",
      "created_at" timestamp with time zone DEFAULT "now"(),
      CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['issued'::"text", 'paid'::"text"])))
  );

  CREATE TABLE IF NOT EXISTS "public"."newsletter_subscribers" (
      "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
      "email" "text" NOT NULL,
      "created_at" timestamp with time zone DEFAULT "now"()
  );

  CREATE TABLE IF NOT EXISTS "public"."orders" (
      "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
      "order_id" "text" NOT NULL,
      "full_name" "text" NOT NULL,
      "email" "text",
      "mobile" "text" NOT NULL,
      "address" "text" NOT NULL,
      "district" "text" NOT NULL,
      "area" "text",
      "notes" "text",
      "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
      "subtotal" numeric DEFAULT 0,
      "delivery_charge" numeric DEFAULT 0,
      "total" numeric NOT NULL,
      "payment_method" "text" DEFAULT 'cod'::"text",
      "payment_status" "text" DEFAULT 'unpaid'::"text",
      "status" "text" DEFAULT 'pending'::"text",
      "tracking_note" "text",
      "admin_notes" "text",
      "invoice_number" "text",
      "created_at" timestamp with time zone DEFAULT "now"(),
      "updated_at" timestamp with time zone DEFAULT "now"(),
      "bkash_transaction_id" "text",
      "shipping_method" "text",
      "coupon_code" "text",
      "discount_amount" numeric DEFAULT 0 NOT NULL,
      "refunded_amount" numeric DEFAULT 0 NOT NULL,
      "advance_verified_at" timestamp with time zone,
      "utm_source" "text",
      "utm_medium" "text",
      "utm_campaign" "text",
      "courier" "text",
      "consignment_id" "text",
      "courier_status" "text",
      "courier_synced_at" timestamp with time zone,
      "advance_amount" numeric DEFAULT 0 NOT NULL,
      "confirmation_sent_at" timestamp with time zone,
      "stock_mode" "text",
      "stock_taken" boolean DEFAULT false NOT NULL,
      "exchange_extra" numeric DEFAULT 0 NOT NULL,
      "exchange_fees" numeric DEFAULT 0 NOT NULL,
      "exchange_fee_unpaid" numeric DEFAULT 0 NOT NULL,
      "return_fee_paid" boolean,
      CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'advance_paid'::"text", 'paid'::"text"]))),
      CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'processing'::"text", 'shipped'::"text", 'delivered'::"text", 'returned'::"text", 'cancelled'::"text"])))
  );

  CREATE TABLE IF NOT EXISTS "public"."products" (
      "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
      "name" "text" NOT NULL,
      "slug" "text" NOT NULL,
      "category" "text" NOT NULL,
      "price" numeric NOT NULL,
      "original_price" numeric,
      "cost_price" numeric DEFAULT 0,
      "quantity" numeric DEFAULT 0,
      "size_stock" "jsonb" DEFAULT '{}'::"jsonb",
      "sku" "text",
      "description" "text" NOT NULL,
      "details" "text",
      "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
      "sizes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
      "colors" "text"[] DEFAULT '{}'::"text"[],
      "stock_status" "text" DEFAULT 'in_stock'::"text",
      "is_featured" boolean DEFAULT false,
      "is_new_arrival" boolean DEFAULT false,
      "is_best_seller" boolean DEFAULT false,
      "discount_percentage" numeric DEFAULT 0,
      "fabric" "text",
      "care_instructions" "text",
      "sort_order" numeric DEFAULT 0,
      "created_at" timestamp with time zone DEFAULT "now"(),
      "updated_at" timestamp with time zone DEFAULT "now"(),
      "variant" "text",
      "drop_name" "text",
      "sizes_out" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
      "size_chart" "jsonb",
      "colour_group" "text",
      "publish_at" timestamp with time zone,
      "shop_position" integer,
      "image_focus" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
      "hidden" boolean DEFAULT false NOT NULL,
      CONSTRAINT "products_category_check" CHECK (("btrim"("category") <> ''::"text")),
      CONSTRAINT "products_stock_status_check" CHECK (("stock_status" = ANY (ARRAY['in_stock'::"text", 'low_stock'::"text", 'out_of_stock'::"text"])))
  );

  CREATE TABLE IF NOT EXISTS "public"."profiles" (
      "id" "uuid" NOT NULL,
      "email" "text",
      "role" "text" DEFAULT 'user'::"text" NOT NULL,
      "created_at" timestamp with time zone DEFAULT "now"(),
      CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'user'::"text"])))
  );

  CREATE TABLE IF NOT EXISTS "public"."reviews" (
      "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
      "product_id" "uuid",
      "product_name" "text" NOT NULL,
      "author_name" "text" NOT NULL,
      "rating" numeric NOT NULL,
      "comment" "text" NOT NULL,
      "is_approved" boolean DEFAULT false,
      "created_at" timestamp with time zone DEFAULT "now"(),
      CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= (1)::numeric) AND ("rating" <= (5)::numeric)))
  );

  CREATE TABLE IF NOT EXISTS "public"."settings" (
      "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
      "store_name" "text" DEFAULT 'SUNDAY'::"text" NOT NULL,
      "store_email" "text",
      "store_phone" "text",
      "store_address" "text",
      "dhaka_delivery_charge" numeric DEFAULT 60,
      "outside_dhaka_delivery_charge" numeric DEFAULT 120,
      "facebook_url" "text",
      "instagram_url" "text",
      "whatsapp_number" "text",
      "created_at" timestamp with time zone DEFAULT "now"()
  );

  CREATE TABLE IF NOT EXISTS "public"."wishlist_items" (
      "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
      "product_id" "uuid",
      "user_session" "text" NOT NULL,
      "created_at" timestamp with time zone DEFAULT "now"()
  );


  -- Keys, unique and foreign keys, checks.

  ALTER TABLE ONLY "public"."contact_messages"
      ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."expenses"
      ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."invoices"
      ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");

  ALTER TABLE ONLY "public"."invoices"
      ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."newsletter_subscribers"
      ADD CONSTRAINT "newsletter_subscribers_email_key" UNIQUE ("email");

  ALTER TABLE ONLY "public"."newsletter_subscribers"
      ADD CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."orders"
      ADD CONSTRAINT "orders_order_id_key" UNIQUE ("order_id");

  ALTER TABLE ONLY "public"."orders"
      ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."products"
      ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."products"
      ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");

  ALTER TABLE ONLY "public"."profiles"
      ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."reviews"
      ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."settings"
      ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."wishlist_items"
      ADD CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id");

  ALTER TABLE ONLY "public"."profiles"
      ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

  ALTER TABLE ONLY "public"."reviews"
      ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;

  ALTER TABLE ONLY "public"."wishlist_items"
      ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


  -- Indexes.

  CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);

  CREATE INDEX "idx_orders_mobile" ON "public"."orders" USING "btree" ("mobile");

  CREATE INDEX "idx_orders_order_id" ON "public"."orders" USING "btree" ("order_id");

  CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category");

  CREATE INDEX "idx_products_created_at" ON "public"."products" USING "btree" ("created_at" DESC);

  CREATE INDEX "idx_reviews_product_id" ON "public"."reviews" USING "btree" ("product_id");

  CREATE INDEX "orders_consignment_idx" ON "public"."orders" USING "btree" ("consignment_id") WHERE ("consignment_id" IS NOT NULL);

  CREATE INDEX "orders_coupon_code_idx" ON "public"."orders" USING "btree" ("coupon_code") WHERE ("coupon_code" IS NOT NULL);

  CREATE INDEX "products_colour_group_idx" ON "public"."products" USING "btree" ("colour_group");

  CREATE INDEX "products_drop_name_idx" ON "public"."products" USING "btree" ("drop_name");


  -- Row level security, and the policies as they are live — less the four
  -- that call functions a later migration makes (rate_limit_ok,
  -- collection_hidden): those migrations make those policies too.

  ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;

  ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;

  ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;

  ALTER TABLE "public"."newsletter_subscribers" ENABLE ROW LEVEL SECURITY;

  ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

  ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

  ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

  ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;

  ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;

  ALTER TABLE "public"."wishlist_items" ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Admin only delete invoices" ON "public"."invoices" FOR DELETE USING ((("auth"."jwt"() ->> 'email'::"text") = 'sundayclothin@gmail.com'::"text"));

  CREATE POLICY "Admin only delete orders" ON "public"."orders" FOR DELETE USING ((("auth"."jwt"() ->> 'email'::"text") = 'sundayclothin@gmail.com'::"text"));

  CREATE POLICY "Admin only update invoices" ON "public"."invoices" FOR UPDATE USING ((("auth"."jwt"() ->> 'email'::"text") = 'sundayclothin@gmail.com'::"text"));

  CREATE POLICY "Admin only update orders" ON "public"."orders" FOR UPDATE USING ((("auth"."jwt"() ->> 'email'::"text") = 'sundayclothin@gmail.com'::"text"));

  CREATE POLICY "Admin removes from the mailing list" ON "public"."newsletter_subscribers" FOR DELETE TO "authenticated" USING ("public"."is_admin"());

  CREATE POLICY "Admins can delete reviews" ON "public"."reviews" FOR DELETE USING ("public"."is_admin"());

  CREATE POLICY "Admins can moderate reviews" ON "public"."reviews" FOR UPDATE USING ("public"."is_admin"());

  CREATE POLICY "Admins can update orders" ON "public"."orders" FOR UPDATE USING ("public"."is_admin"());

  CREATE POLICY "Admins can view all orders" ON "public"."orders" FOR SELECT USING ("public"."is_admin"());

  CREATE POLICY "Admins can view contact messages" ON "public"."contact_messages" FOR SELECT USING ("public"."is_admin"());

  CREATE POLICY "Admins can view subscribers" ON "public"."newsletter_subscribers" FOR SELECT USING ("public"."is_admin"());

  CREATE POLICY "Approved reviews are public" ON "public"."reviews" FOR SELECT USING ((("is_approved" = true) OR "public"."is_admin"()));

  CREATE POLICY "Only admins can access expenses" ON "public"."expenses" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

  CREATE POLICY "Only admins can access invoices" ON "public"."invoices" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

  CREATE POLICY "Only admins can modify products" ON "public"."products" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

  CREATE POLICY "Only admins can modify settings" ON "public"."settings" FOR UPDATE USING ("public"."is_admin"());

  CREATE POLICY "Settings are public read" ON "public"."settings" FOR SELECT USING (true);

  CREATE POLICY "Signed-in admins manage wishlist items" ON "public"."wishlist_items" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

  CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));

  CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_admin"()));


  -- Who may use them (Supabase's defaults for public tables).

  GRANT ALL ON TABLE "public"."contact_messages" TO "anon";

  GRANT ALL ON TABLE "public"."contact_messages" TO "authenticated";

  GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";

  GRANT ALL ON TABLE "public"."expenses" TO "anon";

  GRANT ALL ON TABLE "public"."expenses" TO "authenticated";

  GRANT ALL ON TABLE "public"."expenses" TO "service_role";

  GRANT ALL ON TABLE "public"."invoices" TO "anon";

  GRANT ALL ON TABLE "public"."invoices" TO "authenticated";

  GRANT ALL ON TABLE "public"."invoices" TO "service_role";

  GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "anon";

  GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "authenticated";

  GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "service_role";

  GRANT ALL ON TABLE "public"."orders" TO "anon";

  GRANT ALL ON TABLE "public"."orders" TO "authenticated";

  GRANT ALL ON TABLE "public"."orders" TO "service_role";

  GRANT ALL ON TABLE "public"."products" TO "anon";

  GRANT ALL ON TABLE "public"."products" TO "authenticated";

  GRANT ALL ON TABLE "public"."products" TO "service_role";

  GRANT ALL ON TABLE "public"."profiles" TO "anon";

  GRANT ALL ON TABLE "public"."profiles" TO "authenticated";

  GRANT ALL ON TABLE "public"."profiles" TO "service_role";

  GRANT ALL ON TABLE "public"."reviews" TO "anon";

  GRANT ALL ON TABLE "public"."reviews" TO "authenticated";

  GRANT ALL ON TABLE "public"."reviews" TO "service_role";

  GRANT ALL ON TABLE "public"."settings" TO "anon";

  GRANT ALL ON TABLE "public"."settings" TO "authenticated";

  GRANT ALL ON TABLE "public"."settings" TO "service_role";

  GRANT ALL ON TABLE "public"."wishlist_items" TO "service_role";
end
$baseline$;
