# Simple Slips - Complete Platform Documentation

## Overview

Simple Slips is a comprehensive AI-powered financial management platform designed specifically for South African freelancers, solopreneurs, and small businesses. The platform combines intelligent receipt management with professional business tools to streamline financial operations and tax preparation.

**Version:** 2.0  
**Target Market:** South Africa  
**Pricing:** R49/month with 30-day free trial  
**Platform:** Web (PWA), iOS App Store, Google Play Store

---

## Core Platform Features

### 1. Smart Receipt Management

**AI-Powered Receipt Scanning**
- Instant camera-based receipt capture
- Azure Form Recognizer OCR extracts all details automatically
- Works with any South African retailer format
- Offline scanning capability for remote areas
- 99.9% OCR accuracy rate

**Intelligent Categorization**
- GPT-4o powered automatic categorization
- 24 preset categories optimized for South African market
- Machine learning adapts to user spending patterns
- Custom category creation and management
- Confidence scoring with "Needs Review" filter

**Advanced Search & Organization**
- Dual-mode search: AI semantic search + text-based fallback
- Natural language queries (e.g., "Show me restaurant expenses in July")
- Filter by category, date range, amount, merchant
- Bulk operations: select, delete, categorize multiple receipts
- Tag system for flexible organization

**Image Enhancement**
- Automatic image preprocessing using Sharp library
- Auto-rotate, sharpen, contrast adjustment
- Noise reduction for improved OCR accuracy
- 3:4 aspect ratio display optimization

### 2. Business Hub (Premium Feature)

**Client Management**
- Complete client database with contact details
- VAT registration numbers
- Billing and physical addresses
- Email and phone information
- Client activity tracking

**Professional Quotations**
- Create detailed quotations with line items
- Customizable item descriptions, quantities, unit prices
- Automatic total calculations including VAT
- Expiry date tracking
- Status management: Draft, Sent, Accepted, Declined, Expired
- Per-user sequential numbering (QUO-2025-001, QUO-2025-002, etc.)
- Annual reset of numbering
- One-click conversion to invoice

**Invoice Management**
- Professional invoice generation
- Line item support with detailed breakdowns
- Due date tracking
- Payment status: Unpaid, Partially Paid, Paid, Overdue, Cancelled
- Per-user sequential numbering (INV-2025-001, INV-2025-002, etc.)
- Payment tracking and history
- Overdue invoice dashboard

**AI-Powered Email Assistant**
- GPT-4o generates professional email messages
- Context-aware content based on document type and amount
- Smart subject line generation
- Automatic tone and language optimization
- One-click "Send to Client" with PDF attachment
- Professional HTML email templates with company branding

**Smart Payment Reminders**
- Automated overdue invoice detection
- Progressive reminder cadencing (3/7/7/14 days)
- Four-level urgency system (low/medium/high/critical)
- AI-generated reminder messages
- Quick-send buttons from dashboard
- Payment prediction analytics

**Business Profile Configuration**
- Company name and logo
- VAT registration details
- Banking information for invoices
- Contact details (email, phone, address)
- Custom branding on documents

**P&L Report Generation**
- Automated profit and loss calculations
- Income from invoices
- Expenses from receipts
- Net profit/loss tracking
- Export to PDF/CSV

### 3. Tax Compliance Tools

**AI Tax Assistant Chatbot**
- GPT-4o powered with South African tax law context
- 2024-2025 tax year information
- Tax bracket calculations
- Common deductions guidance
- SARS documentation references
- Clear disclaimers (not affiliated with SARS)

**Tax-Deductible Tracking**
- Automatic identification of tax-deductible expenses
- Visual indicators on receipts
- YTD deductible amount tracking
- Category-based deduction summaries
- Professional tax report generation

**Tax Dashboard**
- Days until tax deadline countdown
- Total deductible amount summary
- Category breakdown of deductibles
- Personalized tax tips based on spending patterns
- Common tax questions and answers

### 4. Analytics & Insights

**Spending Analytics**
- Monthly spending trends with charts
- Category breakdowns with visual representations
- Budget vs actual spending analysis
- Year-over-year comparisons
- Custom date range filtering

**Budget Management**
- Set budgets by category
- Real-time tracking and alerts
- Overspending notifications
- Budget performance visualization
- Monthly budget summaries

**Business Performance**
- Revenue tracking from invoices
- Expense tracking from receipts
- Profit margin analysis
- Client payment behavior
- Cash flow forecasting

### 5. Security & Privacy

**Enterprise-Grade Security**
- Bank-level encryption for all data
- JWT token authentication
- Secure session management
- Password hashing with bcrypt
- Rate limiting on API endpoints

**Data Privacy**
- GDPR-compliant data handling
- Complete user data control
- Account deletion with full cleanup
- Data export capabilities (PDF/CSV)
- Privacy policy and terms of service

**Cloud Infrastructure**
- Azure Blob Storage for receipt images
- Neon PostgreSQL serverless database
- Automatic backups
- 99.9% uptime guarantee
- Cross-device sync

---

## Technical Architecture

### Frontend
- **Framework:** React with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS + shadcn/ui components
- **Routing:** Wouter
- **State Management:** TanStack Query
- **Forms:** React Hook Form with Zod validation

### Backend
- **Framework:** Express.js with TypeScript (ESM)
- **Database:** PostgreSQL with Drizzle ORM
- **Authentication:** Passport.js + JWT tokens
- **Session Storage:** PostgreSQL-backed sessions
- **Email Service:** SendGrid

### AI Services
- **OCR:** Azure Form Recognizer
- **Categorization:** OpenAI GPT-4o
- **Search:** OpenAI GPT-4o (semantic) + PostgreSQL (text)
- **Email Drafting:** OpenAI GPT-4o
- **Tax Assistant:** OpenAI GPT-4o

### Payment Processing
- **Primary:** Paystack (recurring subscriptions)
- **iOS:** Apple In-App Purchase (StoreKit)
- **Android:** Google Play Billing

---

## User Journey

### 1. Onboarding
1. Sign up with email and password
2. Email verification (optional but recommended)
3. 30-day free trial starts automatically
4. Welcome tour of features

### 2. Receipt Management
1. Scan receipt using camera or upload image
2. AI extracts and categorizes automatically
3. Review and edit if needed (confidence scoring helps)
4. Receipt saved to cloud storage
5. Searchable and exportable immediately

### 3. Business Operations (Premium)
1. Add clients to database
2. Create quotation with line items
3. Use AI to draft professional email
4. Send quotation to client via email
5. Convert accepted quote to invoice
6. Track payment status
7. Automated reminders for overdue payments

### 4. Tax Preparation
1. Track deductible expenses throughout year
2. Ask AI Tax Assistant for guidance
3. Review tax dashboard and tips
4. Generate professional tax report
5. Export to PDF/CSV for accountant
6. Submit to SARS (user handles directly)

### 5. Analytics & Reporting
1. View spending trends on dashboard
2. Analyze category breakdowns
3. Monitor budget performance
4. Generate P&L reports for business
5. Make informed financial decisions

---

## Subscription & Pricing

### Free Trial
- **Duration:** 30 days
- **Access:** Full platform access including Business Hub
- **No Credit Card:** Not required for trial
- **Automatic Conversion:** Converts to free tier after trial (receipt management only)

### Premium Subscription
- **Price:** R49/month
- **Billing:** Recurring monthly via Paystack
- **Features Included:**
  - Unlimited receipt scanning and storage
  - Business Hub (quotations, invoices, clients)
  - AI email assistant
  - Smart payment reminders
  - P&L report generation
  - Tax compliance tools
  - Advanced analytics
  - Priority support

### Platform Availability
- **Web App:** Direct subscription via Paystack
- **iOS:** In-App Purchase via Apple (R49/month)
- **Android:** Google Play Billing (R49/month)

---

## Email System

### Transactional Emails
- **From:** notifications@simpleslips.co.za
- **Service:** SendGrid
- **Types:**
  - Welcome emails
  - Email verification
  - Password reset
  - Payment confirmations
  - Payment failure alerts
  - Subscription cancellation notices

### Business Emails
- **From:** User's verified email or notifications@simpleslips.co.za
- **Service:** SendGrid
- **Types:**
  - Quotation delivery
  - Invoice delivery
  - Payment reminders
  - Custom business communications

### Email Tracking
- **Events Tracked:**
  - Delivered
  - Bounced
  - Opened
  - Clicked
- **Admin Dashboard:** Email tracking analytics available to admins

---

## Admin System

### Admin Access
- **Role Field:** `is_admin` boolean in users table
- **Current Admin:** KeoraSoko (keo@nine28.co.za)
- **Protection:** AdminRoute component + backend checks

### Admin Features
- Email tracking dashboard (`/admin/email-tracking`)
- User management (via SQL)
- System monitoring
- Subscription management

### Managing Admins
```sql
-- Make user admin
UPDATE users SET is_admin = true WHERE username = 'username_here';

-- Remove admin access
UPDATE users SET is_admin = false WHERE username = 'username_here';

-- List all admins
SELECT id, username, email, is_admin FROM users WHERE is_admin = true;
```

---

## Deployment & Infrastructure

### Production Environment
- **Hosting:** Replit
- **Domain:** simpleslips.app
- **Database:** Neon PostgreSQL (serverless)
- **Storage:** Azure Blob Storage
- **CDN:** Cloudflare (for static assets)

### Mobile Apps
- **iOS:** PWA Builder → App Store
- **Android:** PWA Builder → Google Play
- **Update Method:** Over-the-air via web updates

### Environment Variables
```
DATABASE_URL=<neon_postgres_connection_string>
JWT_SECRET=<jwt_secret_key>
SESSION_SECRET=<session_secret_key>
AZURE_FORM_RECOGNIZER_ENDPOINT=<azure_endpoint>
AZURE_FORM_RECOGNIZER_KEY=<azure_key>
AZURE_STORAGE_CONNECTION_STRING=<azure_storage>
OPENAI_API_KEY=<openai_key>
SENDGRID_API_KEY=<sendgrid_key>
PAYSTACK_SECRET_KEY=<paystack_secret>
VITE_PAYSTACK_PUBLIC_KEY=<paystack_public>
```

---

## Support & Documentation

### User Support
- **Email:** support@simpleslips.co.za
- **Response Time:** 24-48 hours
- **Knowledge Base:** In-app help articles
- **FAQ:** Common questions answered

### Developer Documentation
- **API Documentation:** OpenAPI/Swagger (if needed)
- **Integration Guides:** For accountants and tax professionals
- **Webhook Documentation:** For payment systems

### Legal & Compliance
- **Privacy Policy:** https://simpleslips.co.za/privacy
- **Terms of Service:** Standard EULA
- **SARS Disclaimer:** Clearly stated (not affiliated)
- **GDPR Compliance:** Full data portability and deletion

---

## Roadmap & Future Features

### Phase 1 (Current - MVP)
- ✅ Receipt scanning and management
- ✅ Business Hub (quotations, invoices, clients)
- ✅ AI email assistant
- ✅ Smart payment reminders
- ✅ Tax compliance tools
- ✅ P&L reporting

### Phase 2 (Q1 2025)
- Multi-currency support
- Recurring invoice automation
- Bank statement imports
- Mobile app native features
- Team collaboration (multi-user accounts)

### Phase 3 (Q2 2025)
- Integration with accounting software (Xero, QuickBooks)
- Advanced reporting and forecasting
- Client portal for invoice viewing
- Payment gateway integration (instant payments)
- Expense approval workflows

### Phase 4 (Q3 2025)
- API for third-party integrations
- White-label solution for accountants
- Advanced AI insights and recommendations
- Localization (Afrikaans, Zulu, Xhosa)
- Tax filing assistance (with registered partners)

---

## Competitive Advantages

1. **South African Specialization**
   - Built for SA tax laws and retailer formats
   - SARS documentation references
   - Local payment gateway (Paystack)
   - Rand (R) currency native

2. **Complete Business Solution**
   - Not just receipts - full business management
   - Quotations + invoices + client management
   - All-in-one platform reduces tool sprawl

3. **AI-Powered Intelligence**
   - Smart categorization learns user patterns
   - Natural language search
   - Email drafting saves hours
   - Predictive payment reminders

4. **Affordable Pricing**
   - R49/month (competitors: R200-500/month)
   - 30-day free trial (no credit card)
   - No per-user fees
   - Transparent pricing

5. **Privacy & Security**
   - No data selling
   - GDPR compliant
   - Complete user control
   - Local data storage options

---

## Target Audience

### Primary Users
- **Freelancers:** Graphic designers, writers, consultants
- **Solopreneurs:** One-person businesses
- **Small Business Owners:** <10 employees
- **Tax Professionals:** Managing client receipts

### Secondary Users
- **Families:** Household budget management
- **Students:** Tracking university expenses
- **Property Managers:** Rental expense tracking
- **Event Planners:** Project expense tracking

### Market Size (South Africa)
- **Freelancers:** ~500,000
- **Small Businesses:** ~2.5 million
- **Tax Practitioners:** ~15,000
- **Total Addressable Market:** ~3 million users

---

## Success Metrics

### User Engagement
- Daily active users (DAU)
- Receipts scanned per user per month
- Invoices created per business user
- Email open rates
- Search queries per session

### Business Metrics
- Monthly recurring revenue (MRR)
- Customer acquisition cost (CAC)
- Lifetime value (LTV)
- Churn rate
- Net promoter score (NPS)

### Technical Metrics
- OCR accuracy rate
- API response times
- System uptime
- Error rates
- Email deliverability

---

## Contact & Resources

**Website:** https://simpleslips.app  
**Support:** support@simpleslips.co.za  
**Privacy:** https://simpleslips.co.za/privacy  
**Social Media:** @SimpleslipsApp (Twitter, Facebook, LinkedIn)  

**Developer:** Nine28 Digital  
**Lead Developer:** KeoraSoko  
**Version:** 2.0  
**Last Updated:** November 2025

---

*Simple Slips is not affiliated with the South African Revenue Service (SARS) or any government entity. All tax information is sourced from publicly available SARS documentation and provided for general guidance only.*
