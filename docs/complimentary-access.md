# Complimentary access

Admin Billing Operations offers a date-specific goodwill grant for active users whose local subscription is paused. This is an access overlay in an audited billing event, not a payment or a subscription transition. No schema migration or background timer is needed. Access checks reject expired grants at read time; workspace members inherit the owner's access and existing plan seat capacity.

The action requires normal admin authentication, exact subscription ownership, explicit confirmation, an audit reason of 10–500 characters, and a future expiry no more than 90 days away. It serializes under the existing owner billing lock. It inserts only an `admin_complimentary_access_granted` event (expiry, subscription ID, admin ID, reason, source goodwill, paymentReceived false). It does not change payment totals, references, failed attempts, local subscription status, billing dates, or Paystack. Latest grant for the subscription takes precedence.

Tiaan's approved proposed inputs:

- User: 385
- Subscription: 354
- Expiry UTC: `2026-10-15T09:30:00Z` (15 October 2026, 11:30 SAST)
- Reason: `Goodwill access following payment difficulties`

After deployment, an authenticated admin must review and confirm the grant. Then perform a read-only effective-access check and audit lookup: hasActiveSubscription true, isInTrial false, subscriptionType premium, complimentaryExpiresAt exact expiry. Verify subscription remains paused with unchanged next billing date and unchanged payment records. Do not tell the customer access is granted before that verification. Production read-only restrictions must not be bypassed.

At expiry, a still-paused account loses complimentary access; a legitimate active paid subscription continues through normal rules. Billing UI retains paused/unpaid status. Rollback of code removes the overlay from access evaluation without altering payment records. No generic activate_subscription action should be used as a fallback.
