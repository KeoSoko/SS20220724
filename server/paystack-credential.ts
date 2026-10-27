/**
 * Canonical server-only Paystack credential lookup.
 *
 * Keep the secret in Replit's managed environment configuration. Callers may
 * impose stricter mode/format requirements for their operation, but they must
 * all obtain the credential through this resolver.
 */
export function getPaystackSecretKey(): string | undefined {
  return process.env.PAYSTACK_SECRET_KEY;
}