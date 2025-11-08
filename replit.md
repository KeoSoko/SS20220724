# Simple Slips - AI-Powered Receipt Management System

## Overview
Simple Slips is an AI-powered receipt management system for the South African market. It enables users to efficiently scan, categorize, and manage receipts. The project is in its MVP launch phase with a production-ready infrastructure, comprehensive Google Play Store assets, and a full feature set including custom PDF reports, account management, and a subscription billing system. The business vision is to provide a seamless, AI-driven solution for personal and small business expense tracking, simplifying financial management and tax preparation.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Updates (November 2025)
### Business Hub Feature
- Added comprehensive quotation and invoicing system for solopreneurs and freelancers
- Replaced "Tax Pros" navigation with "Business Hub" for better feature alignment
- Tax Dashboard now accessible from Business Hub section

### Business Hub Bug Fixes (November 4, 2025)
- **Line Items Display**: Fixed query key issue preventing line items from showing on quotation and invoice detail pages
- **Manual Status Changes**: Added dropdown status selector with business rules for quotations and invoices (previously locked after creation)
- **Edit Form Data Persistence**: Fixed edit forms to properly pre-populate with existing data instead of wiping clean

### AI-Powered Email & Smart Reminders (MVP Phase 2-3)
- **AI Email Assistant**: GPT-4o powered email drafting for quotations and invoices with contextual, professional messaging
- **Smart Subject Lines**: Auto-generated subject lines based on document type, amount, and due dates
- **Email Delivery**: One-click "Send to Client" buttons with PDF attachments via SendGrid
- **Email Verification System**: Auto-population of business email with user's login email, automatic verification testing against SendGrid, seamless zero-friction onboarding for users who want to send from their login email
- **Smart Reminder System**: Automated payment reminder detection with progressive cadencing (3/7/7/14 days)
- **Urgency Escalation**: Four-level priority system (low/medium/high/critical) based on days overdue
- **Payment Predictions**: AI analysis of client payment patterns to forecast cash flow
- **Dashboard Widgets**: Real-time overdue invoice tracking with quick-send reminder buttons
- **Graceful Fallbacks**: System continues working even if OpenAI API is unavailable

### Search Enhancements
- Enabled AI-powered semantic search using GPT-4o for intelligent natural language queries
- Implemented dual-mode search: AI semantic search (primary) with 60% threshold text search (fallback)
- Improved search relevance to filter out irrelevant results while maintaining flexibility

### Pre-Launch Enhancements (November 8, 2025)
- **Final Pricing**: Standardized to R49/month with 30-day free trial across all platforms (Google Play, Apple App Store)
- **Needs Review Filter**: Quick filter button on receipts page shows only receipts with confidence scores below 80% for easy verification
- **Bulk Receipt Operations**: Complete batch operations system with:
  - Selection mode toggle with checkboxes on each receipt
  - Select All / Clear selection controls
  - Bulk delete with confirmation dialog
  - Bulk categorize with category selector
  - Visual feedback with bulk action bar showing selected count
  - Proper error handling and cache invalidation

## System Architecture
The system is built as a full-stack TypeScript application within a monorepo structure, separating client, server, and shared code.

### UI/UX Decisions
- **Frontend Technology**: React with TypeScript and Vite.
- **Styling**: Tailwind CSS with shadcn/ui for consistent design components.
- **Design Philosophy**: Responsive, mobile-first design with a professional blue color scheme (#0073AA). Features a consistent component library, subtle rounded corners (2px), and enhanced visual hierarchy. All circular UI elements have been replaced with square/rectangular alternatives for a consistent geometric design.
- **Accessibility**: Includes ARIA labels and keyboard navigation.
- **Mobile Optimization**: Progressive Web App (PWA) optimized for app store deployment, featuring native-like camera integration, offline support, and a 3:4 aspect ratio for receipt image displays.
- **Login UX**: Accepts both username and email for login.

### Technical Implementations
- **Backend Technology**: Express.js with TypeScript (ESM modules).
- **Database**: PostgreSQL with Drizzle ORM, utilizing Neon Database for serverless PostgreSQL.
- **Authentication**: JWT tokens with Passport.js local strategy, including email verification. Session management is handled by PostgreSQL.
- **Admin System**: Role-based access control with `isAdmin` field in users table. AdminRoute component restricts access to admin-only features like email tracking dashboard.
- **Security**: Implements rate limiting and Zod schemas for input validation.
- **Billing System**: Uses Paystack for recurring subscriptions, allowing for better revenue retention and cross-platform compatibility, bypassing app store commissions.
- **Account Management**: Includes robust account deletion functionality with password verification, complete data cleanup, and GDPR-compliant security.
- **Image Handling**: Session storage preserves receipt images and form data during navigation for a seamless user experience. Original receipts are deleted upon splitting.
- **Promo Code System**: Supports promotional codes for extended trial periods during user signup.
- **Tax Deductible System**: Functionality for tracking and displaying tax-deductible amounts.
- **Email System**: Comprehensive email tracking system (delivered, bounced, opened, clicked) with SendGrid webhooks.

### Feature Specifications
- **AI-Powered Receipt Processing**: Utilizes Azure Form Recognizer for OCR and OpenAI GPT-4o for categorization and smart search.
  - **Enhanced Image Preprocessing**: Receipt images are automatically enhanced before OCR using Sharp library (auto-rotate, sharpen, contrast adjustment, noise reduction) for improved accuracy.
  - **Confidence Scoring**: Visual indicators (high/medium/low) on receipt cards show OCR confidence levels to help users identify receipts that may need review.
  - **Smart Learning System**: Database tables track user corrections (user_corrections) and merchant patterns (merchant_patterns) to improve future categorization accuracy based on user preferences.
  - **Needs Review Filter**: Quick filter button to show only receipts with confidence scores below 80% for easy verification.
- **Database Schema**: Designed to manage users, receipts, tags, budgets, and custom categories, with support for receipt sharing.
- **Expense Categories**: 24 preset categories optimized for the South African market:
  - Groceries, Electricity & Water, Municipal Rates & Taxes, Rent/Bond
  - Domestic Help & Home Services, Home Maintenance
  - Transport (Public & Taxi), Fuel, Vehicle Maintenance & Licensing
  - Airtime, Data & Internet, Subscriptions (Netflix, Showmax, DStv, etc.)
  - Insurance (Car, Home, Life, Funeral), Pharmacy & Medication
  - Education & Courses, Dining & Takeaways, Entertainment
  - Travel & Accommodation, Clothing & Shopping, Personal Care & Beauty
  - Gifts & Celebrations, Donations & Tithes, Family Support & Remittances
  - Load Shedding Costs, Other/Miscellaneous
- **Business Hub (New)**: Comprehensive quotation and invoicing system for solopreneurs and freelancers:
  - **Client Management**: Full CRUD for client records with contact details, VAT numbers, and addresses
  - **Quotations**: Create, send, and track quotations with line items, expiry dates, and status tracking (draft, sent, accepted, declined, expired)
  - **Invoices**: Generate invoices with line items, due dates, payment tracking, and status management (unpaid, partially paid, paid, overdue, cancelled)
  - **Convert Quote to Invoice**: One-click conversion from accepted quotations to invoices
  - **Business Profile**: Configure company branding, VAT registration, banking details for professional documents
  - **Dashboard Analytics**: Track unpaid invoices, client counts, and business performance at a glance
- **Smart Search & Analytics**: Dual-mode intelligent search system combining AI-powered semantic search with text-based fallback:
  - **Primary**: GPT-4o semantic search understands natural language queries (e.g., "coffee" matches Starbucks, "grocery shopping" finds all grocery stores) and ranks results by relevance
  - **Fallback**: 60% match threshold text search activates if AI search fails or returns no results (requires at least 60% of search terms to match, allowing flexible searches like "pick n pay" while filtering irrelevant results)
  - Also includes spending trend analysis, real-time budget monitoring, and export options (PDF, CSV)
- **AI Tax Assistant Chatbot**: An OpenAI GPT-4o powered chatbot provides contextual tax advice specific to South African regulations.
- **Recurring Expense System**: Detects and manages recurring expenses through pattern recognition and predictive analysis.
- **Subscription Management**: Complete system with 30-day free trials and monthly subscriptions (R49).
- **Custom Category Management**: Allows users to create and filter receipts by custom categories.

## External Dependencies

### Cloud Services
- **Azure Form Recognizer**: Primary OCR service for receipt text extraction.
- **Azure Blob Storage**: Cloud storage for receipt images.
- **OpenAI API**: Powers AI categorization, smart search, and the AI Tax Assistant chatbot.
- **SendGrid**: Used for email notifications (verification, password resets) and email event tracking.
- **Neon Database**: Provides serverless PostgreSQL database instance.
- **Paystack**: Payment gateway for recurring subscription billing.

### Key NPM Packages
- **Frontend**: React, Tanstack Query, Wouter (routing), Radix UI.
- **Backend**: Express, Drizzle ORM, Passport.js, JWT, Sharp (image preprocessing).
- **Development**: Vite, TypeScript, Tailwind CSS, ESBuild.

## Admin System

Simple Slips includes a role-based admin system for managing admin-only features and monitoring.

### How It Works
- **Database Field**: `is_admin` boolean field in users table (default: false)
- **Frontend Protection**: AdminRoute component checks user.isAdmin before allowing access
- **Backend Protection**: API routes can check req.user.isAdmin for authorization
- **Non-admin Redirect**: Non-admin users trying to access admin pages are redirected to home

### Admin-Only Features
- **Email Tracking Dashboard** (`/admin/email-tracking`): Monitor email deliverability, bounces, and engagement

### Managing Admin Users

**Current Admin**: KeoraSoko (keo@nine28.co.za)

**To make another user an admin:**
```sql
UPDATE users SET is_admin = true WHERE username = 'username_here';
```

**To remove admin access:**
```sql
UPDATE users SET is_admin = false WHERE username = 'username_here';
```

**To list all admins:**
```sql
SELECT id, username, email, is_admin FROM users WHERE is_admin = true;
```