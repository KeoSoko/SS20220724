import { pgTable, text, serial, integer, boolean, timestamp, jsonb, primaryKey, pgEnum, uuid, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Predefined expense categories optimized for South African context
export const EXPENSE_CATEGORIES = [
  "groceries",
  "electricity_water",
  "municipal_rates_taxes",
  "rent_bond",
  "domestic_help_home_services",
  "home_maintenance",
  "transport_public_taxi",
  "fuel",
  "vehicle_maintenance_licensing",
  "airtime_data_internet",
  "subscriptions",
  "insurance",
  "pharmacy_medication",
  "education_courses",
  "dining_takeaways",
  "entertainment",
  "travel_accommodation",
  "clothing_shopping",
  "personal_care_beauty",
  "gifts_celebrations",
  "donations_tithes",
  "family_support_remittances",
  "load_shedding_costs",
  "other"
] as const;

// Subcategories for advanced categorization (South African context)
export const EXPENSE_SUBCATEGORIES: Record<typeof EXPENSE_CATEGORIES[number], string[]> = {
  "groceries": ["pick_n_pay", "woolworths", "checkers", "spar", "shoprite", "food_lovers", "makro", "game", "usave"],
  "electricity_water": ["eskom", "city_power", "prepaid_electricity", "municipal_water", "borehole", "rainwater_tank"],
  "municipal_rates_taxes": ["property_rates", "refuse_removal", "sewerage", "assessment_rates", "municipal_services"],
  "rent_bond": ["apartment", "house", "townhouse", "flat", "room", "bond_payment", "levies", "body_corporate"],
  "domestic_help_home_services": ["domestic_worker", "gardener", "cleaning_service", "security_guard", "handyman", "pool_service"],
  "home_maintenance": ["plumbing", "electrical", "painting", "repairs", "appliances", "roof_repair", "pest_control", "builders"],
  "transport_public_taxi": ["minibus_taxi", "bus", "metrorail", "gautrain", "myciti", "uber", "bolt", "taxi_fare"],
  "fuel": ["petrol", "diesel", "engen", "shell", "bp", "sasol", "total", "caltex"],
  "vehicle_maintenance_licensing": ["car_service", "tyres", "license_renewal", "roadworthy", "car_wash", "registration", "parts", "battery"],
  "airtime_data_internet": ["vodacom", "mtn", "cell_c", "telkom", "rain", "airtime", "data_bundles", "wifi", "fibre"],
  "subscriptions": ["netflix", "showmax", "dstv", "spotify", "amazon_prime", "disney_plus", "youtube_premium", "apple_music"],
  "insurance": ["car_insurance", "home_insurance", "life_insurance", "funeral_cover", "santam", "outsurance", "old_mutual", "discovery", "momentum"],
  "pharmacy_medication": ["clicks", "dischem", "chronic_medication", "prescription", "over_the_counter", "supplements", "medical_supplies"],
  "education_courses": ["school_fees", "university", "college", "tuition", "textbooks", "stationery", "online_courses", "certifications"],
  "dining_takeaways": ["restaurants", "uber_eats", "mr_d", "fast_food", "steers", "kfc", "nandos", "wimpy", "ocean_basket", "coffee_shops"],
  "entertainment": ["movies", "ster_kinekor", "nu_metro", "concerts", "sports_events", "casino", "games", "hobbies", "streaming"],
  "travel_accommodation": ["flights", "hotels", "guest_house", "bnb", "car_rental", "vacation", "kruger_park", "activities", "fuel_travel"],
  "clothing_shopping": ["edgars", "woolworths", "mr_price", "ackermans", "truworths", "sportscene", "fashion", "shoes", "accessories"],
  "personal_care_beauty": ["salon", "barber", "clicks_beauty", "skincare", "cosmetics", "spa", "gym", "virgin_active", "planet_fitness"],
  "gifts_celebrations": ["birthday", "christmas", "wedding", "baby_shower", "anniversary", "valentines", "graduation", "party_supplies"],
  "donations_tithes": ["church_offering", "tithes", "charity", "ngo", "gift_of_the_givers", "red_cross", "animal_welfare", "community_support"],
  "family_support_remittances": ["family_allowance", "child_support", "parent_support", "send_money", "easyequities", "bank_transfer"],
  "load_shedding_costs": ["inverter", "generator", "solar_panels", "ups", "batteries", "candles", "gas_stove", "backup_power"],
  "other": ["miscellaneous", "professional_fees", "legal", "accounting", "banking_fees", "atm_fees", "membership", "licenses"]
};

// Create a PostgreSQL enum for expense categories
export const expenseCategoryEnum = pgEnum("expense_category", [...EXPENSE_CATEGORIES]);

// Custom categories table for user-defined categories
export const customCategories = pgTable("custom_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  color: text("color").default("#6B7280"), // Default gray color
  icon: text("icon"), // Icon name for display
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Define the users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(), // Stores hashed password
  email: text("email").unique(),
  fullName: text("full_name"),
  birthdate: text("birthdate"),
  gender: text("gender"),
  phoneNumber: text("phone_number"),
  address: text("address"),
  profilePicture: text("profile_picture"), // URL to profile picture
  isActive: boolean("is_active").default(true).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  lastLogin: timestamp("last_login"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  accountLockedUntil: timestamp("account_locked_until"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  emailVerificationToken: text("email_verification_token"),
  emailVerifiedAt: timestamp("email_verified_at"),
  isEmailVerified: boolean("is_email_verified").default(false),
  rememberMeToken: text("remember_me_token"),
  sessionTimeout: integer("session_timeout").default(60), // Session timeout in minutes
  tokenVersion: integer("token_version").default(1).notNull(), // Token version for invalidating JWT tokens
  promoCodeUsed: text("promo_code_used"), // Promo code used during signup
  trialEndDate: timestamp("trial_end_date"), // When trial period ends
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Define the receipts table with enhanced metadata
export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Receipt basic data
  storeName: text("store_name").notNull(),
  date: timestamp("date").notNull(),
  total: text("total").notNull(),
  
  // Receipt items as JSON array
  items: jsonb("items").notNull().$type<Array<{name: string, price: string}>>(),
  
  // Azure storage references
  blobUrl: text("blob_url"),
  blobName: text("blob_name"),
  imageData: text("image_data"), // For backward compatibility
  
  // Enhanced categorization and metadata
  category: expenseCategoryEnum("category").notNull().default("other"),
  subcategory: text("subcategory"), // Store subcategory for advanced analytics
  tags: jsonb("tags").$type<string[]>().default([]),
  notes: text("notes"),
  isRecurring: boolean("is_recurring").default(false), // Flag for recurring expenses
  frequency: text("frequency"), // Monthly, weekly, yearly, etc. for recurring expenses
  paymentMethod: text("payment_method"), // Cash, credit card, etc.
  
  // OCR metadata
  confidenceScore: text("confidence_score"),
  rawOcrData: jsonb("raw_ocr_data"), // Store raw OCR results for future processing
  
  // Geographic data (optional)
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  
  // Budget tracking
  budgetCategory: text("budget_category"), // Optional custom budget category
  
  // Tax and financial management
  isTaxDeductible: boolean("is_tax_deductible").default(false),
  taxCategory: text("tax_category"), // For tax reporting purposes
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
  processedAt: timestamp("processed_at"), // When OCR processing was completed
});

// Define tags table for analytics and filtering
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Many-to-many relationship table for receipt_tags
export const receiptTags = pgTable("receipt_tags", {
  receiptId: integer("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.receiptId, t.tagId] }),
}));

// Authentication tokens for JWT-based API access
export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isRevoked: boolean("is_revoked").default(false).notNull(),
});

// Budgets table for expense budgeting feature
export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: expenseCategoryEnum("category").notNull(),
  monthlyLimit: doublePrecision("monthly_limit").notNull(),
  currentSpent: doublePrecision("current_spent").default(0).notNull(),
  alertThreshold: integer("alert_threshold").default(80), // Alert at 80% by default
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Receipt sharing for family/accountant access
export const receiptShares = pgTable("receipt_shares", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  sharedByUserId: integer("shared_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedWithEmail: text("shared_with_email").notNull(),
  accessLevel: text("access_level").notNull().default("view"), // view, edit
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Email receipt imports
export const emailReceipts = pgTable("email_receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emailId: text("email_id").unique(),
  fromEmail: text("from_email").notNull(),
  subject: text("subject").notNull(),
  receivedAt: timestamp("received_at").notNull(),
  processed: boolean("processed").default(false).notNull(),
  receiptId: integer("receipt_id").references(() => receipts.id),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User preferences and settings
export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  emailReceiptForwarding: text("email_receipt_forwarding"), // Email address for forwarding
  backupReminders: boolean("backup_reminders").default(true).notNull(),
  budgetAlerts: boolean("budget_alerts").default(true).notNull(),
  duplicateDetection: boolean("duplicate_detection").default(true).notNull(),
  autoCategorizationEnabled: boolean("auto_categorization_enabled").default(true).notNull(),
  defaultCurrency: text("default_currency").default("ZAR").notNull(),
  taxYear: integer("tax_year").default(2025).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Receipt duplicates detection
export const receiptDuplicates = pgTable("receipt_duplicates", {
  id: serial("id").primaryKey(),
  originalReceiptId: integer("original_receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  duplicateReceiptId: integer("duplicate_receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  similarity: doublePrecision("similarity").notNull(), // 0.0 to 1.0
  status: text("status").default("pending").notNull(), // pending, confirmed, dismissed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Tax settings for comprehensive tax planning
export const taxSettings = pgTable("tax_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  taxBracket: integer("tax_bracket").default(18).notNull(), // South African tax brackets
  isBusinessOwner: boolean("is_business_owner").default(false).notNull(),
  businessType: text("business_type").default("sole_proprietor").notNull(),
  estimatedIncome: integer("estimated_income").default(0).notNull(),
  filingStatus: text("filing_status").default("single").notNull(),
  taxYear: integer("tax_year").default(2025).notNull(),
  homeOfficePercentage: integer("home_office_percentage").default(0).notNull(), // Percentage for home office deduction
  businessCarPercentage: integer("business_car_percentage").default(0), // Business use percentage for car
  businessPhonePercentage: integer("business_phone_percentage").default(0), // Business use percentage for phone
  vatNumber: text("vat_number"), // VAT registration number
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// SARS expense categories mapping
export const sarsExpenseCategories = pgTable("sars_expense_categories", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // Our internal category
  sarsCode: text("sars_code").notNull(), // SARS expense code
  sarsDescription: text("sars_description").notNull(), // SARS description
  deductibilityType: text("deductibility_type").notNull(), // 'full', 'partial', 'conditional', 'none'
  businessPercentageRequired: boolean("business_percentage_required").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Audit trail for tax compliance
export const receiptAuditTrail = pgTable("receipt_audit_trail", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // 'created', 'updated', 'deleted', 'categorized'
  fieldChanged: text("field_changed"), // specific field that was changed
  oldValue: text("old_value"), // previous value
  newValue: text("new_value"), // new value
  reason: text("reason"), // reason for change
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Subscription plans configuration
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // "Free Trial", "Premium Monthly"
  displayName: text("display_name").notNull(), // "7-Day Free Trial", "Premium Monthly"
  description: text("description"),
  price: integer("price").notNull(), // Price in cents (ZAR)
  currency: text("currency").default("ZAR").notNull(),
  billingPeriod: text("billing_period").notNull(), // "trial", "monthly", "yearly"
  trialDays: integer("trial_days").default(0), // Number of trial days
  googlePlayProductId: text("google_play_product_id"), // Google Play product ID
  appleProductId: text("apple_product_id"), // Apple App Store product ID
  features: jsonb("features").$type<string[]>().default([]), // List of features
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// User subscriptions tracking
export const userSubscriptions = pgTable("user_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => subscriptionPlans.id),
  status: text("status").notNull().default("trial"), // "trial", "active", "expired", "cancelled", "paused"
  
  // Trial tracking
  trialStartDate: timestamp("trial_start_date"),
  trialEndDate: timestamp("trial_end_date"),
  
  // Subscription tracking
  subscriptionStartDate: timestamp("subscription_start_date"),
  nextBillingDate: timestamp("next_billing_date"),
  cancelledAt: timestamp("cancelled_at"),
  
  // Google Play billing integration
  googlePlayPurchaseToken: text("google_play_purchase_token"),
  googlePlayOrderId: text("google_play_order_id"),
  googlePlaySubscriptionId: text("google_play_subscription_id"),
  
  // Paystack billing integration
  paystackReference: text("paystack_reference"),
  paystackCustomerCode: text("paystack_customer_code"),
  
  // Apple App Store billing integration
  appleReceiptData: text("apple_receipt_data"),
  appleTransactionId: text("apple_transaction_id"),
  appleOriginalTransactionId: text("apple_original_transaction_id"),
  
  // Billing tracking
  totalPaid: integer("total_paid").default(0), // Total amount paid in cents
  lastPaymentDate: timestamp("last_payment_date"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Payment transactions for billing history
export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").references(() => userSubscriptions.id),
  
  // Transaction details
  amount: integer("amount").notNull(), // Amount in cents
  currency: text("currency").default("ZAR").notNull(),
  status: text("status").notNull(), // "pending", "completed", "failed", "refunded"
  platform: text("platform").notNull(), // "google_play", "paystack", "apple", etc.
  
  // Platform specific transaction IDs
  platformTransactionId: text("platform_transaction_id"), // Google Play purchase token, Paystack reference, etc.
  platformOrderId: text("platform_order_id"), // Platform order ID
  platformSubscriptionId: text("platform_subscription_id"), // Platform subscription ID
  
  // Metadata for all platforms
  metadata: jsonb("metadata"), // Platform-specific data
  
  // Metadata
  description: text("description"),
  failureReason: text("failure_reason"),
  refundReason: text("refund_reason"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Billing events for webhook handling
export const billingEvents = pgTable("billing_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  eventType: text("event_type").notNull(), // "subscription_started", "payment_failed", etc.
  eventData: jsonb("event_data"), // Raw event data from Google Play
  processed: boolean("processed").default(false),
  processingError: text("processing_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Promo codes for trial extensions and special offers
export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g., "EARLYACCESS"
  description: text("description"), // Human-friendly description
  trialDays: integer("trial_days").notNull(), // Number of trial days this code provides
  maxUses: integer("max_uses"), // Maximum number of uses (null = unlimited)
  usedCount: integer("used_count").default(0).notNull(), // How many times it's been used
  isActive: boolean("is_active").default(true).notNull(), // Whether code is active
  expiresAt: timestamp("expires_at"), // When the code expires (null = never expires)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Define table relations
export const usersRelations = relations(users, ({ one, many }) => ({
  receipts: many(receipts),
  tags: many(tags),
  authTokens: many(authTokens),
  budgets: many(budgets),
  receiptShares: many(receiptShares),
  emailReceipts: many(emailReceipts),
  preferences: one(userPreferences),
  customCategories: many(customCategories),
  taxSettings: one(taxSettings),
  subscriptions: many(userSubscriptions),
  paymentTransactions: many(paymentTransactions),
}));

export const customCategoriesRelations = relations(customCategories, ({ one }) => ({
  user: one(users, {
    fields: [customCategories.userId],
    references: [users.id],
  }),
}));

export const receiptsRelations = relations(receipts, ({ one, many }) => ({
  user: one(users, {
    fields: [receipts.userId],
    references: [users.id],
  }),
  tags: many(receiptTags),
  shares: many(receiptShares),
  duplicateOf: many(receiptDuplicates, { relationName: "original" }),
  duplicates: many(receiptDuplicates, { relationName: "duplicate" }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  receipts: many(receiptTags),
}));

export const receiptTagsRelations = relations(receiptTags, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptTags.receiptId],
    references: [receipts.id],
  }),
  tag: one(tags, {
    fields: [receiptTags.tagId],
    references: [tags.id],
  }),
}));

export const authTokensRelations = relations(authTokens, ({ one }) => ({
  user: one(users, {
    fields: [authTokens.userId],
    references: [users.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, {
    fields: [budgets.userId],
    references: [users.id],
  }),
}));

export const receiptSharesRelations = relations(receiptShares, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptShares.receiptId],
    references: [receipts.id],
  }),
  sharedBy: one(users, {
    fields: [receiptShares.sharedByUserId],
    references: [users.id],
  }),
}));

export const emailReceiptsRelations = relations(emailReceipts, ({ one }) => ({
  user: one(users, {
    fields: [emailReceipts.userId],
    references: [users.id],
  }),
  receipt: one(receipts, {
    fields: [emailReceipts.receiptId],
    references: [receipts.id],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

export const receiptDuplicatesRelations = relations(receiptDuplicates, ({ one }) => ({
  original: one(receipts, {
    fields: [receiptDuplicates.originalReceiptId],
    references: [receipts.id],
    relationName: "original",
  }),
  duplicate: one(receipts, {
    fields: [receiptDuplicates.duplicateReceiptId],
    references: [receipts.id],
    relationName: "duplicate",
  }),
}));

export const taxSettingsRelations = relations(taxSettings, ({ one }) => ({
  user: one(users, {
    fields: [taxSettings.userId],
    references: [users.id],
  }),
}));

export const receiptAuditTrailRelations = relations(receiptAuditTrail, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptAuditTrail.receiptId],
    references: [receipts.id],
  }),
  user: one(users, {
    fields: [receiptAuditTrail.userId],
    references: [users.id],
  }),
}));

// Billing table relations
export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  subscriptions: many(userSubscriptions),
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [userSubscriptions.userId],
    references: [users.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [userSubscriptions.planId],
    references: [subscriptionPlans.id],
  }),
  transactions: many(paymentTransactions),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  user: one(users, {
    fields: [paymentTransactions.userId],
    references: [users.id],
  }),
  subscription: one(userSubscriptions, {
    fields: [paymentTransactions.subscriptionId],
    references: [userSubscriptions.id],
  }),
}));

export const billingEventsRelations = relations(billingEvents, ({ one }) => ({
  user: one(users, {
    fields: [billingEvents.userId],
    references: [users.id],
  }),
}));

// Define insertion schemas with validation
// Password validation regex patterns
const LOWERCASE_REGEX = /[a-z]/;
const UPPERCASE_REGEX = /[A-Z]/;
const DIGIT_REGEX = /[0-9]/;
const SPECIAL_CHAR_REGEX = /[!@#$%^&*(),.?":{}|<>]/;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
  birthdate: true,
  gender: true,
  phoneNumber: true,
  address: true,
  profilePicture: true,
  sessionTimeout: true,
  failedLoginAttempts: true,
  accountLockedUntil: true,
  passwordResetToken: true,
  passwordResetExpires: true,
  emailVerificationToken: true,
  emailVerifiedAt: true,
  isEmailVerified: true,
  rememberMeToken: true,
}).extend({
  username: z.string()
    .min(3, "Username must be at least 3 characters long")
    .max(30, "Username must be less than 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  
  password: z.string()
    .min(8, "Password must be at least 8 characters long")
    .max(64, "Password must be less than 64 characters")
    .refine(
      (password) => LOWERCASE_REGEX.test(password),
      { message: "Password must contain at least one lowercase letter" }
    )
    .refine(
      (password) => UPPERCASE_REGEX.test(password),
      { message: "Password must contain at least one uppercase letter" }
    )
    .refine(
      (password) => DIGIT_REGEX.test(password),
      { message: "Password must contain at least one number" }
    )
    .refine(
      (password) => SPECIAL_CHAR_REGEX.test(password),
      { message: "Password must contain at least one special character" }
    ),
  
  email: z.string().email("Please enter a valid email address").optional(),
  fullName: z.string().optional(),
  birthdate: z.string().optional(),
  gender: z.string().optional(),
  phoneNumber: z.string().optional(),
  address: z.string().optional(),
  profilePicture: z.string().optional(),
  sessionTimeout: z.number().optional(),
  rememberMe: z.boolean().optional(),
});

// Custom schema for receipt insertion
export const insertReceiptSchema = z.object({
  userId: z.number(),
  storeName: z.string().min(1, "Store name is required"),
  // Accept string, date, or any valid date format
  date: z.union([
    z.string(),
    z.date(),
    z.number() // Unix timestamp
  ]).transform((val) => {
    try {
      const dateObj = new Date(val);
      if (isNaN(dateObj.getTime())) {
        return new Date(); // Default to current date if invalid
      }
      return dateObj;
    } catch {
      return new Date(); // Default to current date on error
    }
  }),
  total: z.string().or(z.number().transform(n => String(n))),
  items: z.preprocess(
    (val) => {
      // Handle string input (JSON)
      if (typeof val === 'string') {
        try {
          // Handle empty array cases
          if (val === "[]" || val.trim() === "") {
            return [];
          }
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.error("Failed to parse items:", e, val);
          return [];
        }
      }
      
      // Handle array input
      if (Array.isArray(val)) {
        return val;
      }
      
      // Handle null/undefined
      if (!val) {
        return [];
      }
      
      // Handle single item object
      if (typeof val === 'object') {
        return [val];
      }
      
      return [];
    },
    z.array(
      z.object({
        name: z.string().default("Item"),
        price: z.string().or(z.number().transform(n => String(n))).default("0.00")
      })
    ).default([])
  ),
  blobUrl: z.string().nullable().optional(),
  blobName: z.string().nullable().optional(),
  imageData: z.string().nullable().optional(),
  
  // Enhanced categorization fields (allow both predefined and custom categories)
  category: z.string().default("other"),
  subcategory: z.string().optional(),
  tags: z.preprocess(
    // Handle if tags comes as string (from JSON.stringify)
    (val) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return [];
        }
      }
      return val;
    },
    z.array(z.string()).default([])
  ),
  notes: z.string().nullable().optional(),
  
  // Receipt metadata
  isRecurring: z.boolean().optional().default(false),
  frequency: z.string().optional(),
  paymentMethod: z.string().optional(),
  
  // OCR metadata
  confidenceScore: z.string().or(z.number().transform(n => String(n))).nullable().optional(),
  rawOcrData: z.any().optional(),
  
  // Geographic data
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  
  // Budget tracking
  budgetCategory: z.string().optional(),
  
  // Tax and financial management
  isTaxDeductible: z.boolean().optional().default(false),
  taxCategory: z.string().optional(),
});

// Schema for creating and updating tags
export const insertTagSchema = z.object({
  userId: z.number(),
  name: z.string().min(1, "Tag name is required"),
});

// Schema for token creation
export const insertAuthTokenSchema = z.object({
  userId: z.number(),
  expiresAt: z.date(),
});

// Schema for custom categories
export const insertCustomCategorySchema = createInsertSchema(customCategories).pick({
  userId: true,
  name: true,
  displayName: true,
  description: true,
  color: true,
  icon: true,
}).extend({
  name: z.string()
    .min(1, "Category name is required")
    .max(50, "Category name must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_\s]+$/, "Category name can only contain letters, numbers, underscores, and spaces"),
  displayName: z.string()
    .min(1, "Display name is required")
    .max(50, "Display name must be less than 50 characters"),
  description: z.string().max(200, "Description must be less than 200 characters").optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Color must be a valid hex color").default("#6B7280"),
  icon: z.string().max(50, "Icon name must be less than 50 characters").optional(),
});

// Schema for budget creation
export const insertBudgetSchema = z.object({
  userId: z.number(),
  name: z.string().min(1, "Budget name is required"),
  category: z.enum([...EXPENSE_CATEGORIES]),
  monthlyLimit: z.number().positive("Monthly limit must be positive"),
  alertThreshold: z.number().min(1).max(100).default(80),
  isActive: z.boolean().default(true),
});

// Schema for receipt sharing
export const insertReceiptShareSchema = z.object({
  receiptId: z.number(),
  sharedByUserId: z.number(),
  sharedWithEmail: z.string().email("Valid email required"),
  accessLevel: z.enum(["view", "edit"]).default("view"),
  expiresAt: z.date().optional(),
});

// Schema for user preferences
export const insertUserPreferencesSchema = z.object({
  userId: z.number(),
  emailReceiptForwarding: z.string().email().optional(),
  backupReminders: z.boolean().default(true),
  budgetAlerts: z.boolean().default(true),
  duplicateDetection: z.boolean().default(true),
  autoCategorizationEnabled: z.boolean().default(true),
  defaultCurrency: z.string().default("ZAR"),
  taxYear: z.number().default(2025),
});

// Export types for TypeScript
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type ReceiptShare = typeof receiptShares.$inferSelect;
export type InsertReceiptShare = z.infer<typeof insertReceiptShareSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type EmailReceipt = typeof emailReceipts.$inferSelect;
export type ReceiptDuplicate = typeof receiptDuplicates.$inferSelect;
export type TaxSettings = typeof taxSettings.$inferSelect;
export type InsertTaxSettings = z.infer<typeof insertTaxSettingsSchema>;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

// Tax settings schema
export const insertTaxSettingsSchema = createInsertSchema(taxSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// SARS expense categories schema
export const insertSarsExpenseCategorySchema = createInsertSchema(sarsExpenseCategories).omit({
  id: true,
  createdAt: true,
});

// Receipt audit trail schema
export const insertReceiptAuditTrailSchema = createInsertSchema(receiptAuditTrail).omit({
  id: true,
  timestamp: true,
});

// Billing schemas
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Plan name is required"),
  displayName: z.string().min(1, "Display name is required"),
  price: z.number().min(0, "Price must be positive"),
  billingPeriod: z.enum(["trial", "monthly", "yearly"]),
  trialDays: z.number().min(0, "Trial days must be positive"),
  features: z.array(z.string()).default([]),
});

export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["trial", "active", "expired", "cancelled", "paused"]).default("trial"),
});

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  amount: z.number().positive("Amount must be positive"),
  status: z.enum(["pending", "completed", "failed", "refunded"]),
  paymentMethod: z.enum(["google_play", "card", "bank_transfer", "other"]),
});

export const insertBillingEventSchema = createInsertSchema(billingEvents).omit({
  id: true,
  createdAt: true,
});

// Promo code schema
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({
  id: true,
  usedCount: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  code: z.string().min(3, "Promo code must be at least 3 characters").toUpperCase(),
  trialDays: z.number().positive("Trial days must be positive"),
  maxUses: z.number().positive("Max uses must be positive").optional().nullable(),
});

// Email tracking for deliverability monitoring
export const emailEvents = pgTable("email_events", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull(), // SendGrid message ID
  email: text("email").notNull(), // Recipient email
  eventType: text("event_type").notNull(), // delivered, bounce, deferred, dropped, spam_report, open, click
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  emailType: text("email_type"), // verification, password_reset, welcome, etc.
  bounceReason: text("bounce_reason"), // For bounce events
  bounceType: text("bounce_type"), // hard or soft bounce
  smtpResponse: text("smtp_response"), // SMTP error message
  userAgent: text("user_agent"), // For open/click events
  clickedUrl: text("clicked_url"), // For click events
  ipAddress: text("ip_address"), // For open/click events
  rawEvent: jsonb("raw_event"), // Store full event for debugging
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User corrections table - tracks when users edit receipt data
export const userCorrections = pgTable("user_corrections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiptId: integer("receipt_id").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  fieldName: text("field_name").notNull(), // category, storeName, total, etc.
  originalValue: text("original_value").notNull(), // What AI/OCR suggested
  correctedValue: text("corrected_value").notNull(), // What user changed it to
  confidenceScore: text("confidence_score"), // Original confidence from OCR/AI
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Merchant patterns table - learns user's categorization preferences
export const merchantPatterns = pgTable("merchant_patterns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  merchantName: text("merchant_name").notNull(), // Normalized store name
  category: expenseCategoryEnum("category").notNull(), // User's preferred category for this merchant
  subcategory: text("subcategory"), // User's preferred subcategory
  correctionCount: integer("correction_count").default(1).notNull(), // How many times user set this category
  lastCorrectedAt: timestamp("last_corrected_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Additional types for tax compliance
export type SarsExpenseCategory = typeof sarsExpenseCategories.$inferSelect;
export type InsertSarsExpenseCategory = z.infer<typeof insertSarsExpenseCategorySchema>;
export type ReceiptAuditTrail = typeof receiptAuditTrail.$inferSelect;
export type InsertReceiptAuditTrail = z.infer<typeof insertReceiptAuditTrailSchema>;

// Billing types
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type BillingEvent = typeof billingEvents.$inferSelect;
export type InsertBillingEvent = z.infer<typeof insertBillingEventSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;

// Email event schema
export const insertEmailEventSchema = createInsertSchema(emailEvents).omit({
  id: true,
  createdAt: true,
});

export const insertUserCorrectionSchema = createInsertSchema(userCorrections).omit({
  id: true,
  createdAt: true,
});

export const insertMerchantPatternSchema = createInsertSchema(merchantPatterns).omit({
  id: true,
  createdAt: true,
  lastCorrectedAt: true,
});

// Email tracking types
export type EmailEvent = typeof emailEvents.$inferSelect;
export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;

// User corrections types
export type UserCorrection = typeof userCorrections.$inferSelect;
export type InsertUserCorrection = z.infer<typeof insertUserCorrectionSchema>;

// Merchant patterns types
export type MerchantPattern = typeof merchantPatterns.$inferSelect;
export type InsertMerchantPattern = z.infer<typeof insertMerchantPatternSchema>;

// ===== BUSINESS HUB SCHEMA =====

// Business profile for invoice/quotation branding
export const businessProfiles = pgTable("business_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  tradingName: text("trading_name"),
  registrationNumber: text("registration_number"),
  vatNumber: text("vat_number"),
  isVatRegistered: boolean("is_vat_registered").default(false).notNull(),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  country: text("country").default("South Africa"),
  bankName: text("bank_name"),
  accountHolder: text("account_holder"),
  accountNumber: text("account_number"),
  branchCode: text("branch_code"),
  swiftCode: text("swift_code"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Clients table
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  companyName: text("company_name"),
  vatNumber: text("vat_number"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  country: text("country").default("South Africa"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Quotations table
export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  quotationNumber: text("quotation_number").notNull().unique(),
  date: timestamp("date").notNull().defaultNow(),
  expiryDate: timestamp("expiry_date").notNull(),
  status: text("status").notNull().default("draft"), // draft, sent, accepted, declined, expired
  subtotal: text("subtotal").notNull(),
  vatAmount: text("vat_amount").notNull().default("0"),
  total: text("total").notNull(),
  notes: text("notes"),
  terms: text("terms"),
  convertedToInvoiceId: integer("converted_to_invoice_id"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Invoices table
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull().unique(),
  quotationId: integer("quotation_id").references(() => quotations.id),
  date: timestamp("date").notNull().defaultNow(),
  dueDate: timestamp("due_date").notNull(),
  status: text("status").notNull().default("unpaid"), // unpaid, partially_paid, paid, overdue, cancelled
  subtotal: text("subtotal").notNull(),
  vatAmount: text("vat_amount").notNull().default("0"),
  total: text("total").notNull(),
  amountPaid: text("amount_paid").notNull().default("0"),
  notes: text("notes"),
  terms: text("terms"),
  sentAt: timestamp("sent_at"),
  lastReminderSent: timestamp("last_reminder_sent"),
  reminderCount: integer("reminder_count").notNull().default(0),
  nextReminderDate: timestamp("next_reminder_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Line items for both quotations and invoices
export const lineItems = pgTable("line_items", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").references(() => quotations.id, { onDelete: "cascade" }),
  invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: text("quantity").notNull().default("1"),
  unitPrice: text("unit_price").notNull(),
  total: text("total").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Payment records for invoices
export const invoicePayments = pgTable("invoice_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  amount: text("amount").notNull(),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  paymentMethod: text("payment_method"), // cash, eft, card, etc.
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas for business hub
export const insertBusinessProfileSchema = createInsertSchema(businessProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuotationSchema = createInsertSchema(quotations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  date: z.union([z.date(), z.string()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
  expiryDate: z.union([z.date(), z.string()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  date: z.union([z.date(), z.string()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
  dueDate: z.union([z.date(), z.string()]).transform((val) => typeof val === 'string' ? new Date(val) : val),
});

export const insertLineItemSchema = createInsertSchema(lineItems).omit({
  id: true,
  createdAt: true,
});

export const insertInvoicePaymentSchema = createInsertSchema(invoicePayments).omit({
  id: true,
  createdAt: true,
});

// Types for business hub
export type BusinessProfile = typeof businessProfiles.$inferSelect;
export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;

export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type Quotation = typeof quotations.$inferSelect;
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type LineItem = typeof lineItems.$inferSelect;
export type InsertLineItem = z.infer<typeof insertLineItemSchema>;

export type InvoicePayment = typeof invoicePayments.$inferSelect;
export type InsertInvoicePayment = z.infer<typeof insertInvoicePaymentSchema>;