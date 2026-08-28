export class BillingSubscriptionReadError extends Error {
  readonly cause: unknown;

  constructor(userId: number, cause: unknown) {
    super(`Billing subscription state is unavailable for user ${userId}`);
    this.name = "BillingSubscriptionReadError";
    this.cause = cause;
  }
}

export function isBillingSubscriptionReadError(
  error: unknown,
): error is BillingSubscriptionReadError {
  return error instanceof BillingSubscriptionReadError;
}
