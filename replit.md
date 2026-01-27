# Simple Slips - AI-Powered Receipt Management System

## Overview
Simple Slips is an AI-powered receipt management system for the South African market. It enables users to efficiently scan, categorize, and manage receipts. The project is in its MVP launch phase with a production-ready infrastructure, comprehensive Google Play Store assets, and a full feature set including custom PDF reports, account management, and a subscription billing system. The business vision is to provide a seamless, AI-driven solution for personal and small business expense tracking, simplifying financial management and tax preparation.

## User Preferences
Preferred communication style: Simple, everyday language.

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
- **Authentication**: JWT tokens with Passport.js local strategy, with soft email verification gate. Session management is handled by PostgreSQL.
- **Soft Email Verification Gate**: Unverified users can login and use basic features (receipt upload, viewing, dashboard). Sensitive actions (exports, billing changes, tax reports) are blocked until email is verified, showing a modal dialog with resend CTA. Protected routes use `requireVerifiedEmail` middleware returning 403 with structured error `{"error": "email_verification_required"}`.
- **Admin System**: Role-based access control with `isAdmin` field in users table. AdminRoute component restricts access to admin-only features like email tracking dashboard and Command Center.
- **Admin Command Center**: Comprehensive admin dashboard at /command-center for monitoring system health (user counts, trial status, Azure failures), searching users with usage metrics, viewing detailed user activity, and AI-powered user diagnosis using GPT-4.1 for churn risk analysis and recommended recovery actions. Features clickable health metric cards that instantly filter users by category (unverified, stuck trials, payment failures, Azure failures, email failures). Includes "Today's Attention" alert strip for urgent issues, user risk indicators (red/orange/green dots), recovery playbook guidance per filter, timeline event grouping by category (last 7 days default), and safer destructive action confirmations requiring "CONFIRM" input.
- **Security**: Implements rate limiting and Zod schemas for input validation.
- **Billing System**: Uses Paystack for recurring subscriptions, allowing for better revenue retention and cross-platform compatibility, bypassing app store commissions.
- **Account Management**: Includes robust account deletion functionality with password verification, complete data cleanup, and GDPR-compliant security.
- **Image Handling**: Session storage preserves receipt images and form data during navigation for a seamless user experience. Original receipts are deleted upon splitting.
- **PDF Support**: PDF receipts uploaded via scan or email are automatically converted to JPEG images using pdf2pic (ghostscript/graphicsmagick). This ensures consistent display across all devices and maintains compatibility with image-based OCR processing.
- **Promo Code System**: Supports promotional codes for extended trial periods during user signup.
- **Tax Deductible System**: Functionality for tracking and displaying tax-deductible amounts.
- **Email System**: Comprehensive email tracking system (delivered, bounced, opened, clicked) with SendGrid webhooks. Professional HTML email templates for quotations and invoices with branding and dynamic content.
- **Sequential Numbering**: Per-user sequential numbering for quotations and invoices, with annual reset, implemented with PostgreSQL advisory locks for concurrency safety.

### Feature Specifications
- **AI-Powered Receipt Processing**: Utilizes Azure Form Recognizer for OCR and OpenAI GPT-4o for categorization. Includes enhanced image preprocessing, confidence scoring, and a smart learning system based on user corrections and merchant patterns.
- **Business Hub**: Comprehensive quotation and invoicing system for solopreneurs and freelancers, including client management, quotation/invoice creation and tracking, one-click conversion from quotes to invoices, business profile configuration, and dashboard analytics.
- **Smart Search & Analytics**: Dual-mode intelligent search system combining GPT-4o semantic search for natural language queries and a 60% match threshold text-based fallback. Also includes spending trend analysis, real-time budget monitoring, and export options.
- **AI Tax Assistant Chatbot**: An OpenAI GPT-4o powered chatbot provides contextual tax advice specific to South African regulations.
- **Email & Smart Reminders**: GPT-4o powered email drafting for quotations and invoices, smart subject lines, SendGrid delivery with PDF attachments, and an email verification system. Automated payment reminder system with progressive cadencing and urgency escalation.
- **Receipt Management**: Includes smart filters (date range, amount range, vendor), multi-receipt continuous scanning mode, and batch gallery import with visual queues and progress tracking.
- **Recurring Expense System**: Detects and manages recurring expenses through pattern recognition and predictive analysis.
- **Subscription Management**: Complete system with 30-day free trials, monthly subscriptions (R49), and yearly subscriptions (R530/year - 10% discount). Features a billing period toggle with savings highlight.
- **Custom Category Management**: Allows users to create and filter receipts by custom categories.
- **Expense Categories**: 24 preset categories optimized for the South African market.

## External Dependencies

### Cloud Services
- **Azure Form Recognizer**: Primary OCR service for receipt text extraction.
- **Azure Blob Storage**: Cloud storage for receipt images.
- **OpenAI API**: Powers AI categorization, smart search, and the AI Tax Assistant chatbot.
- **SendGrid**: Used for email notifications and email event tracking.
- **Neon Database**: Provides serverless PostgreSQL database instance.
- **Paystack**: Payment gateway for recurring subscription billing.

### Key NPM Packages
- **Frontend**: React, Tanstack Query, Wouter (routing), Radix UI.
- **Backend**: Express, Drizzle ORM, Passport.js, JWT, Sharp (image preprocessing).
- **Development**: Vite, TypeScript, Tailwind CSS, ESBuild.