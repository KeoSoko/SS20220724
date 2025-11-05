CREATE TYPE "public"."expense_category" AS ENUM('groceries', 'electricity_water', 'municipal_rates_taxes', 'rent_bond', 'domestic_help_home_services', 'home_maintenance', 'transport_public_taxi', 'fuel', 'vehicle_maintenance_licensing', 'airtime_data_internet', 'subscriptions', 'insurance', 'pharmacy_medication', 'education_courses', 'dining_takeaways', 'entertainment', 'travel_accommodation', 'clothing_shopping', 'personal_care_beauty', 'gifts_celebrations', 'donations_tithes', 'family_support_remittances', 'load_shedding_costs', 'other');--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_used" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "auth_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"event_type" text NOT NULL,
	"event_data" jsonb,
	"processed" boolean DEFAULT false,
	"processing_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" "expense_category" NOT NULL,
	"monthly_limit" double precision NOT NULL,
	"current_spent" double precision DEFAULT 0 NOT NULL,
	"alert_threshold" integer DEFAULT 80,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "business_email_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"sendgrid_sender_id" text,
	"verified_at" timestamp,
	"last_verification_error" text,
	"verification_requested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_email_identities_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"company_name" text NOT NULL,
	"trading_name" text,
	"registration_number" text,
	"vat_number" text,
	"is_vat_registered" boolean DEFAULT false NOT NULL,
	"email" text,
	"phone" text,
	"website" text,
	"address" text,
	"city" text,
	"province" text,
	"postal_code" text,
	"country" text DEFAULT 'South Africa',
	"bank_name" text,
	"account_holder" text,
	"account_number" text,
	"branch_code" text,
	"swift_code" text,
	"logo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company_name" text,
	"vat_number" text,
	"address" text,
	"city" text,
	"province" text,
	"postal_code" text,
	"country" text DEFAULT 'South Africa',
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6B7280',
	"icon" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"email" text NOT NULL,
	"event_type" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"user_id" integer,
	"email_type" text,
	"bounce_reason" text,
	"bounce_type" text,
	"smtp_response" text,
	"user_agent" text,
	"clicked_url" text,
	"ip_address" text,
	"raw_event" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email_id" text,
	"from_email" text NOT NULL,
	"subject" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"receipt_id" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_receipts_email_id_unique" UNIQUE("email_id")
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount" text NOT NULL,
	"payment_date" timestamp DEFAULT now() NOT NULL,
	"payment_method" text,
	"reference" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"invoice_number" text NOT NULL,
	"quotation_id" integer,
	"date" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"subtotal" text NOT NULL,
	"vat_amount" text DEFAULT '0' NOT NULL,
	"total" text NOT NULL,
	"amount_paid" text DEFAULT '0' NOT NULL,
	"notes" text,
	"terms" text,
	"sent_at" timestamp,
	"last_reminder_sent" timestamp,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"next_reminder_date" timestamp,
	"pre_due_reminder_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quotation_id" integer,
	"invoice_id" integer,
	"description" text NOT NULL,
	"quantity" text DEFAULT '1' NOT NULL,
	"unit_price" text NOT NULL,
	"total" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"merchant_name" text NOT NULL,
	"category" "expense_category" NOT NULL,
	"subcategory" text,
	"correction_count" integer DEFAULT 1 NOT NULL,
	"last_corrected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"subscription_id" integer,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"status" text NOT NULL,
	"platform" text NOT NULL,
	"platform_transaction_id" text,
	"platform_order_id" text,
	"platform_subscription_id" text,
	"metadata" jsonb,
	"description" text,
	"failure_reason" text,
	"refund_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"trial_days" integer NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"quotation_number" text NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"expiry_date" timestamp NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"subtotal" text NOT NULL,
	"vat_amount" text DEFAULT '0' NOT NULL,
	"total" text NOT NULL,
	"notes" text,
	"terms" text,
	"converted_to_invoice_id" integer,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_quotation_number_unique" UNIQUE("quotation_number")
);
--> statement-breakpoint
CREATE TABLE "receipt_audit_trail" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"field_changed" text,
	"old_value" text,
	"new_value" text,
	"reason" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_duplicates" (
	"id" serial PRIMARY KEY NOT NULL,
	"original_receipt_id" integer NOT NULL,
	"duplicate_receipt_id" integer NOT NULL,
	"similarity" double precision NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" integer NOT NULL,
	"shared_by_user_id" integer NOT NULL,
	"shared_with_email" text NOT NULL,
	"access_level" text DEFAULT 'view' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_tags" (
	"receipt_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "receipt_tags_receipt_id_tag_id_pk" PRIMARY KEY("receipt_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"store_name" text NOT NULL,
	"date" timestamp NOT NULL,
	"total" text NOT NULL,
	"items" jsonb NOT NULL,
	"blob_url" text,
	"blob_name" text,
	"image_data" text,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"subcategory" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"is_recurring" boolean DEFAULT false,
	"frequency" text,
	"payment_method" text,
	"confidence_score" text,
	"raw_ocr_data" jsonb,
	"latitude" double precision,
	"longitude" double precision,
	"budget_category" text,
	"is_tax_deductible" boolean DEFAULT false,
	"tax_category" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sars_expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"sars_code" text NOT NULL,
	"sars_description" text NOT NULL,
	"deductibility_type" text NOT NULL,
	"business_percentage_required" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"billing_period" text NOT NULL,
	"trial_days" integer DEFAULT 0,
	"google_play_product_id" text,
	"apple_product_id" text,
	"features" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tax_bracket" integer DEFAULT 18 NOT NULL,
	"is_business_owner" boolean DEFAULT false NOT NULL,
	"business_type" text DEFAULT 'sole_proprietor' NOT NULL,
	"estimated_income" integer DEFAULT 0 NOT NULL,
	"filing_status" text DEFAULT 'single' NOT NULL,
	"tax_year" integer DEFAULT 2025 NOT NULL,
	"home_office_percentage" integer DEFAULT 0 NOT NULL,
	"business_car_percentage" integer DEFAULT 0,
	"business_phone_percentage" integer DEFAULT 0,
	"vat_number" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "tax_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"receipt_id" integer NOT NULL,
	"field_name" text NOT NULL,
	"original_value" text NOT NULL,
	"corrected_value" text NOT NULL,
	"confidence_score" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email_receipt_forwarding" text,
	"backup_reminders" boolean DEFAULT true NOT NULL,
	"budget_alerts" boolean DEFAULT true NOT NULL,
	"duplicate_detection" boolean DEFAULT true NOT NULL,
	"auto_categorization_enabled" boolean DEFAULT true NOT NULL,
	"default_currency" text DEFAULT 'ZAR' NOT NULL,
	"tax_year" integer DEFAULT 2025 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text DEFAULT 'trial' NOT NULL,
	"trial_start_date" timestamp,
	"trial_end_date" timestamp,
	"subscription_start_date" timestamp,
	"next_billing_date" timestamp,
	"cancelled_at" timestamp,
	"google_play_purchase_token" text,
	"google_play_order_id" text,
	"google_play_subscription_id" text,
	"paystack_reference" text,
	"paystack_customer_code" text,
	"apple_receipt_data" text,
	"apple_transaction_id" text,
	"apple_original_transaction_id" text,
	"total_paid" integer DEFAULT 0,
	"last_payment_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"full_name" text,
	"birthdate" text,
	"gender" text,
	"phone_number" text,
	"address" text,
	"profile_picture" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"last_login" timestamp,
	"failed_login_attempts" integer DEFAULT 0,
	"account_locked_until" timestamp,
	"password_reset_token" text,
	"password_reset_expires" timestamp,
	"email_verification_token" text,
	"email_verified_at" timestamp,
	"is_email_verified" boolean DEFAULT false,
	"remember_me_token" text,
	"session_timeout" integer DEFAULT 60,
	"token_version" integer DEFAULT 1 NOT NULL,
	"promo_code_used" text,
	"trial_end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_email_identities" ADD CONSTRAINT "business_email_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_categories" ADD CONSTRAINT "custom_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_receipts" ADD CONSTRAINT "email_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_receipts" ADD CONSTRAINT "email_receipts_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_patterns" ADD CONSTRAINT "merchant_patterns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_audit_trail" ADD CONSTRAINT "receipt_audit_trail_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_audit_trail" ADD CONSTRAINT "receipt_audit_trail_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_duplicates" ADD CONSTRAINT "receipt_duplicates_original_receipt_id_receipts_id_fk" FOREIGN KEY ("original_receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_duplicates" ADD CONSTRAINT "receipt_duplicates_duplicate_receipt_id_receipts_id_fk" FOREIGN KEY ("duplicate_receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_shares" ADD CONSTRAINT "receipt_shares_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_shares" ADD CONSTRAINT "receipt_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_tags" ADD CONSTRAINT "receipt_tags_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_tags" ADD CONSTRAINT "receipt_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_corrections" ADD CONSTRAINT "user_corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_corrections" ADD CONSTRAINT "user_corrections_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;