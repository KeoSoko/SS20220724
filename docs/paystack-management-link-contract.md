# Paystack hosted management-link contract

## Verified from Paystack documentation

Paystack documents the hosted card-update link as:

- **Method and path:** `GET https://api.paystack.co/subscription/{code}/manage/link`
- **Identifier:** the provider `SUB_*` subscription code in the path.
- **Authentication:** `Authorization: Bearer SECRET_KEY`.
- **Success response:** `{ "status": true, "data": { "link": "https://paystack.com/manage/subscriptions/..." } }`.
- **Purpose:** generate a link for updating the card on an existing subscription.

Source: [Paystack Subscription API — Generate Update Subscription Link](https://paystack.com/docs/api/subscription/#manage-link).

## Application boundary

Simple Slips accepts only the documented `status === true` and `data.link` response shape, and only an HTTPS URL hosted at `paystack.com` below `/manage/subscriptions/`. It does not expose the provider response or persist the URL.

Before requesting the link, the server holds the billing-owner lock and verifies:

1. effective billing ownership at the route boundary;
2. a trusted local canonical `SUB_*`;
3. matching local customer and plan;
4. matching provider subscription detail; and
5. a complete provider subscription listing with exactly one viable canonical relationship.

Any missing, malformed, unavailable, or ambiguous state fails closed. It cannot fall back to checkout, create a subscription, charge an authorization, cancel a subscription, refund, or collect historical missed payments.

## Live-provider validation status

No live request was made for this task: there is no confirmed safe non-customer Paystack test subscription available in this workspace. Paystack’s documentation does not specify link expiry, whether a link is single-use or reusable, or side effects beyond its stated card-update purpose. Those details remain unverified against a safe live test subscription and must not be inferred.