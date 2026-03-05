# simple-slips

## API hardening env vars

`server/index.ts` now uses production-safe defaults and allows overrides via environment variables:

- `DEFAULT_BODY_LIMIT` (default: `1mb`) - body parser limit for non-upload endpoints.
- `UPLOAD_BODY_LIMIT` (default: `25mb`) - larger body parser limit used only on upload endpoints.
- `REQUEST_TIMEOUT_MS` (default: `30000` in production, `120000` otherwise) - request timeout; timed out requests are aborted and return HTTP `408`.
- `RATE_LIMIT_WINDOW_MS` (default: `900000`) - shared rate limit window in ms.
- `RATE_LIMIT_AUTH_MAX` (default: `20` in production, `200` otherwise) - auth endpoint budget.
- `RATE_LIMIT_UPLOAD_MAX` (default: `60` in production, `300` otherwise) - upload endpoint budget.
- `RATE_LIMIT_SEARCH_MAX` (default: `120` in production, `500` otherwise) - search endpoint budget.
- `RATE_LIMIT_GENERAL_MAX` (default: `400` in production, `2000` otherwise) - all other API endpoint budget.


### Endpoint categories

The category routing in `server/index.ts` is explicit to avoid accidental matcher misses:

- Auth rate limit category: `/api/login`, `/api/register`, `/api/logout`, `/api/reset-password`, `/api/verify-email`, `/api/resend-verification`, `/api/token`, `/api/emergency-login`, `/api/invalidate-tokens`.
- Upload rate limit category: `/api/profile/picture`, `/api/receipts`, `/api/receipts/scan`, `/api/business-profile/logo`, `/api/webhooks/inbound-email`.
- Search rate limit category: paths prefixed with `/api/search`, `/api/smart-search`, `/api/receipts/search`, `/api/receipts/smart-search`, `/api/tax/ask`, `/api/tax-assistant`.
- Large body parser category: `/api/profile/picture`, `/api/receipts`, `/api/receipts/scan`, `/api/business-profile/logo`.
