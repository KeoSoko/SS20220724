// Pure, testable user-resolution logic for admin payment reconciliation.
//
// Renewal charges frequently arrive with NO metadata.user_id, so we must be able
// to fall back to the customer email to attribute a stranded payment to the right
// account. Keeping this logic pure (no db / Paystack imports) makes it unit-testable.

export interface ReconcileVerification {
  subscription?: {
    metadata?: { user_id?: number | string | null } | null;
    customer?: { email?: string | null } | null;
  } | null;
}

export interface ReconcileUserLookup<TUser extends { id: number }> {
  getUser: (id: number) => Promise<TUser | undefined>;
  getUserByEmail: (email: string) => Promise<TUser | undefined>;
}

/**
 * Resolve the user for a reconciliation request.
 * Order of precedence (never guesses):
 *   1. metadata.user_id (if present and the account exists)
 *   2. the verified Paystack customer email
 * Returns null when neither resolves to an account.
 */
export async function resolveUserForReconciliation<TUser extends { id: number }>(
  verification: ReconcileVerification,
  lookup: ReconcileUserLookup<TUser>,
): Promise<TUser | null> {
  const rawMetadataUserId = verification.subscription?.metadata?.user_id;
  const metadataUserId =
    typeof rawMetadataUserId === "string" ? Number(rawMetadataUserId) : rawMetadataUserId;

  let user: TUser | undefined;
  if (typeof metadataUserId === "number" && Number.isFinite(metadataUserId)) {
    user = await lookup.getUser(metadataUserId);
  }

  if (!user) {
    const customerEmail = verification.subscription?.customer?.email;
    if (customerEmail) {
      user = await lookup.getUserByEmail(customerEmail);
    }
  }

  return user ?? null;
}
