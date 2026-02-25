# Simple Slips — Architecture Evolution Log

_Last Updated: 2026_

This document captures major architectural decisions, migrations, and system refactors performed during the stabilization and maturation of Simple Slips.

---

# 1. Subscription & Billing Stabilization

## Problem
- Webhooks were unreliable.
- `status = active` allowed access even if `nextBillingDate` had passed.
- Paystack retries were failing due to delayed 200 responses.
- No idempotency safeguards for duplicate webhook events.
- Cancellation behavior removed access immediately.

## Key Changes

### 1.1 Immediate Webhook Acknowledgement
- Webhook now returns `200 OK` **before** processing.
- Event handling moved to asynchronous execution via `setImmediate`.
- Prevents Paystack retry storms and webhook exhaustion.

### 1.2 Strict Access Enforcement
Updated `getSubscriptionStatus()` logic:

- `active` requires `now < nextBillingDate`
- `cancelled` allows access until `nextBillingDate`
- `trial` requires `now < trialEndDate`
- No implicit access based purely on status

This removed indefinite premium access in webhook failure scenarios.

### 1.3 Idempotency Safeguards
- Duplicate `charge.success` guarded via reference check.
- Payment transactions validated before insert.
- Reduced duplicate subscription activation.

### 1.4 Monitoring Jobs Added
- Reconciliation monitoring (overdue active subs)
- Webhook health monitoring (48h inactivity alert)
- Orphaned payment detection
- Upcoming renewal warnings

---

# 2. Workspace Architecture Migration

## Objective
Enable shared workspaces for small teams while maintaining billing isolation.

## Phase 1 — Schema Foundation

### New Tables
- `workspaces`
- `workspace_members`
- `workspace_invites`

### Users Table
- Added `workspaceId NOT NULL`
- All 161 legacy users migrated into personal workspaces

## Phase 2 — Query Scoping

All business data now filtered by:


workspaceId


Affected domains:
- Receipts
- Clients
- Quotations
- Invoices
- Reporting
- Recurring services

Admin routes intentionally remain user-scoped.

Indexes added:
- `idx_receipts_workspace_id`
- `idx_clients_workspace_id`
- `idx_quotations_workspace_id`
- `idx_invoices_workspace_id`

## Phase 3 — Role-Based Permissions

Roles:
- owner
- editor
- viewer

Enforced across 43 routes.

Permission matrix implemented:
- Viewers: read-only
- Editors: create/update (no delete)
- Owners: full control

All unauthenticated → 401  
All unauthorized role access → 403  

---

# 3. Category System Refactor (Major Architectural Cleanup)

## Legacy Problem

Custom categories were embedded inside notes using:


[Custom Category: X]


This caused:
- Regex parsing everywhere
- Hydration bugs
- Category resets on scroll
- Enum corruption
- Reporting inconsistencies
- UI state conflicts

## New Model

| Field | Responsibility |
|--------|---------------|
| `category` | Internal AI classification (strict enum) |
| `report_label` | User-facing custom grouping |

### Rule

report_label ?? category

is the display and reporting value.

---

## 3.1 Migration

Steps:

1. Extracted prefix data from `notes` into `report_label`.
2. Cleaned notes.
3. Verified zero remaining prefix patterns.
4. Confirmed all rows had valid enum `category`.

No data loss occurred.

---

## 3.2 Strict Enum Enforcement

- Removed `normalizeReceiptCategory()`
- Removed all notes-embedding logic
- Category must now be one of EXPENSE_CATEGORIES
- Invalid values → 400 response

This eliminated silent mutation to `"other"`.

---

## 3.3 Reporting Simplification

Old:

getReportingCategory(category, notes)


New:

getReportingCategory(category, reportLabel)


Simplified to:


reportLabel?.trim() || category || 'other'


All reporting services updated.

---

## 3.4 Dropdown Architecture

Unified dropdown structure:

Section 1: System Categories (enum)  
Section 2: Custom Labels  
+ Add New Custom Label

Custom Labels now merge:

- `/api/custom-categories`
- distinct `report_label` values from receipts

Deduplicated via `Set()`.

---

## 3.5 Cache Invalidation Fix

Bug:
New custom label after upload did not appear until hard reload.

Root cause:
`/api/receipts/report-labels` query not invalidated.

Fix:
Added invalidation to upload success handlers:


queryClient.invalidateQueries(["/api/receipts/report-labels"]);


---

# 4. Custom Categories System

Categories created in:


custom_categories


Dropdown now merges:
- custom_categories.displayName
- report_label values

Internal name generation (future improvement):
- Should auto-slugify
- User should not manually define DB identifier

---

# 5. Receipt Hydration Bug Fix

## Problem
Scrolling or background query refetch reset edited category.

## Cause
`useEffect([receipt])` overwrote unsaved state.

## Fix
Introduced:


hasUserModifiedCategory


Guard prevents hydration overwrite until save.

---

# 6. System State Today

✔ Subscription enforcement hardened  
✔ Webhook reliability improved  
✔ Workspace architecture stable  
✔ Role-based permissions enforced  
✔ Category architecture cleaned  
✔ Custom labels fully decoupled from notes  
✔ Reporting consistent and predictable  
✔ Enum integrity enforced  
✔ No rogue category values in DB  

---

# 7. Architectural Principles Adopted

1. Separation of system classification and user grouping
2. Strict enum enforcement for internal logic
3. No silent data mutation
4. Workspace isolation first
5. Idempotent billing processing
6. React Query cache invalidation on mutation
7. No regex-based business logic

---

# 8. Future Improvements

- Auto-slug generation for custom categories
- Optional category grouping layer (report_group)
- Soft deletion for custom categories
- Bulk assign report_label
- Category analytics breakdown by workspace

---

# Summary

Simple Slips transitioned from patch-based fixes to a structured SaaS architecture with:

- Stable billing
- Isolated workspaces
- Controlled permission layers
- Clean category abstraction
- Predictable reporting logic

The system is now suitable for scaling beyond single-user use cases while maintaining data integrity and subscription safety.
