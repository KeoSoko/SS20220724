export type PaystackInvoiceState = "paid" | "unpaid_due" | "pending";

export interface ClassifiedPaystackInvoice {
  state: PaystackInvoiceState;
  invoiceCode: string | null;
  subscriptionCode: string | null;
  customerCode: string | null;
  transactionReference: string | null;
  dueDate: Date | null;
  failureReason: string | null;
}

export interface PaystackRenewalEvidence {
  subscriptionCode: string;
  customerCode: string;
  transactionReference: string;
  invoiceCode: string | null;
}

export type PaystackRecurringReadiness = "ready" | "not_ready" | "unknown";

export interface PaystackAuthorizationEvidence {
  transactionId: string | null;
  transactionReference: string | null;
  transactionChannel: string | null;
  customerCode: string | null;
  planCode: string | null;
  subscriptionCode: string | null;
  authorizationCode: string | null;
  authorizationChannel: string | null;
  authorizationSignature: string | null;
  authorizationReusable: boolean | null;
  providerVerifiedAt: Date | null;
  recurringReadiness: PaystackRecurringReadiness;
}

export function extractPaystackPlanCode(data: any): string | null {
  return asNonEmptyString(
    typeof data?.plan === "string"
      ? data.plan
      : data?.plan?.plan_code
        ?? data?.plan_code
        ?? data?.subscription?.plan?.plan_code
        ?? data?.subscription?.plan_code,
  );
}

export function extractPaystackAuthorizationEvidence(
  data: any,
  providerVerifiedAt: Date | null = new Date(),
  options: { authorizationBoundToSubscription?: boolean } = {},
): PaystackAuthorizationEvidence {
  const authorization = data?.authorization ?? data?.transaction?.authorization ?? null;
  const subscriptionCode = extractPaystackSubscriptionCode(data)
    ?? extractPaystackSubscriptionCode(data?.transaction);
  const customerCode = extractPaystackCustomerCode(data)
    ?? extractPaystackCustomerCode(data?.transaction);
  const transactionReference = extractPaystackTransactionReference(data)
    ?? extractPaystackTransactionReference(data?.transaction);
  const reusable = authorization?.reusable;
  const authorizationReusable = typeof reusable === "boolean" ? reusable : null;
  const authorizationSubscriptionCode = asNonEmptyString(
    authorization?.subscription_code
      ?? authorization?.subscriptionCode
      ?? authorization?.subscription?.subscription_code,
  );
  const authorizationBoundToSubscription = !!(
    authorization?.authorization_code
    && subscriptionCode
    && (
      authorizationSubscriptionCode === subscriptionCode
      || options.authorizationBoundToSubscription === true
    )
  );

  let recurringReadiness: PaystackRecurringReadiness = "unknown";
  if (
    authorizationReusable === false
    || (
      !!authorizationSubscriptionCode
      && !!subscriptionCode
      && authorizationSubscriptionCode !== subscriptionCode
    )
  ) {
    recurringReadiness = "not_ready";
  } else if (authorizationReusable === true && customerCode && authorizationBoundToSubscription) {
    recurringReadiness = "ready";
  }

  return {
    transactionId: asNonEmptyString(data?.id ?? data?.transaction?.id),
    transactionReference,
    transactionChannel: asNonEmptyString(data?.channel ?? data?.transaction?.channel),
    customerCode,
    planCode: extractPaystackPlanCode(data),
    subscriptionCode,
    authorizationCode: asNonEmptyString(authorization?.authorization_code),
    authorizationChannel: asNonEmptyString(
      authorization?.channel ?? authorization?.authorization_channel,
    ),
    authorizationSignature: asNonEmptyString(
      authorization?.signature ?? authorization?.authorization_signature,
    ),
    authorizationReusable,
    providerVerifiedAt,
    recurringReadiness,
  };
}

/**
 * Applies the Apple Pay subscription gate on top of normal recurring-readiness
 * determination. When Apple Pay is disabled (`applePayEnabled = false`) and the
 * transaction channel is `apple_pay`, the readiness is forced to `"not_ready"`
 * regardless of what `authorization.reusable` returned. This preserves the
 * payment (access is still granted) while blocking the recurring relationship.
 *
 * Keeping this as a pure function decouples the gate logic from env-var
 * access so callers (billing-service) inject the flag and tests can drive all
 * branches without process.env manipulation.
 */
export function applyPaystackApplePayGate(
  evidence: PaystackAuthorizationEvidence,
  normalReadiness: PaystackRecurringReadiness,
  applePayEnabled: boolean,
): PaystackRecurringReadiness {
  if (!applePayEnabled && evidence.transactionChannel === "apple_pay") {
    return "not_ready";
  }
  return normalReadiness;
}

export function hasExactPaystackRecurringRelationship(
  evidence: PaystackAuthorizationEvidence,
  expectedCustomerCode: string | null | undefined,
  expectedPlanCode: string | null | undefined,
  expectedSubscriptionCode?: string | null,
): boolean {
  return evidence.recurringReadiness === "ready"
    && !!evidence.customerCode
    && evidence.customerCode === expectedCustomerCode
    && !!evidence.planCode
    && (!expectedPlanCode || evidence.planCode === expectedPlanCode)
    && !!evidence.subscriptionCode
    && (!expectedSubscriptionCode || evidence.subscriptionCode === expectedSubscriptionCode);
}

export interface PaystackSubscriptionCandidateSummary {
  subscriptionCode: string;
  customerCode: string | null;
  planCode: string | null;
  status: string;
  providerCreatedAt: Date | null;
  nextPaymentDate: Date | null;
  recentInvoice: (ClassifiedPaystackInvoice & { createdAt: Date | null }) | null;
  providerLookupFailed: boolean;
}

export type ActivePaystackRenewalRelationshipResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "unknown_subscription_identity"
        | "inactive_subscription_identity"
        | "stale_subscription_identity"
        | "subscription_customer_identity_missing"
        | "subscription_customer_mismatch";
    };

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function parsePaystackDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function extractPaystackSubscriptionCode(data: any): string | null {
  const candidates = [
    data?.subscription?.subscription_code,
    data?.subscription?.code,
    data?.subscription_code,
    typeof data?.subscription === "string" ? data.subscription : null,
  ];
  return candidates.map(asNonEmptyString).find((value) => value?.startsWith("SUB_")) ?? null;
}

export function extractPaystackCustomerCode(data: any): string | null {
  return asNonEmptyString(data?.customer?.customer_code)
    ?? asNonEmptyString(data?.customer_code)
    ?? asNonEmptyString(data?.subscription?.customer?.customer_code)
    ?? asNonEmptyString(data?.transaction?.customer?.customer_code);
}

export function extractPaystackInvoiceCode(data: any): string | null {
  return asNonEmptyString(data?.invoice_code)
    ?? asNonEmptyString(data?.invoice?.invoice_code)
    ?? asNonEmptyString(data?.code);
}

export function extractPaystackTransactionReference(data: any): string | null {
  const candidates = [
    data?.transaction?.reference,
    data?.transaction_reference,
    data?.reference,
  ];
  return candidates.map(asNonEmptyString).find(Boolean) ?? null;
}

/**
 * Extract only provider-owned renewal identifiers.
 *
 * Deliberately excludes metadata: Paystack metadata is supplied by the
 * application/browser and cannot establish that an otherwise untracked charge
 * belongs to a recurring subscription.
 */
export function extractPaystackRenewalEvidence(data: any): PaystackRenewalEvidence | null {
  const subscriptionCode = extractPaystackSubscriptionCode(data);
  const customerCode = extractPaystackCustomerCode(data);
  const transactionReference = extractPaystackTransactionReference(data);
  if (!subscriptionCode || !customerCode || !transactionReference) {
    return null;
  }
  return {
    subscriptionCode,
    customerCode,
    transactionReference,
    invoiceCode: extractPaystackInvoiceCode(data),
  };
}

export function isPaystackInvoicePaid(data: any): boolean {
  return data?.paid === true
    || data?.paid === 1
    || data?.paid === "1"
    || data?.status === "success"
    || data?.status === "paid"
    || data?.transaction?.status === "success";
}

export function classifyPaystackInvoice(
  data: any,
  localNextBillingDate: Date | string | null | undefined,
  now: Date = new Date(),
): ClassifiedPaystackInvoice {
  const paid = isPaystackInvoicePaid(data);
  const localDueDate = parsePaystackDate(localNextBillingDate);
  const providerDueDate = parsePaystackDate(
    data?.due_date
      ?? data?.dueDate
      ?? data?.next_payment_date
      ?? data?.period_end,
  );
  const dueDate = providerDueDate ?? localDueDate;
  const isDue = !!dueDate && dueDate.getTime() <= now.getTime();

  return {
    state: paid ? "paid" : (isDue ? "unpaid_due" : "pending"),
    invoiceCode: extractPaystackInvoiceCode(data),
    subscriptionCode: extractPaystackSubscriptionCode(data),
    customerCode: extractPaystackCustomerCode(data),
    transactionReference: extractPaystackTransactionReference(data),
    dueDate,
    failureReason: asNonEmptyString(data?.failure_reason)
      ?? asNonEmptyString(data?.gateway_response)
      ?? asNonEmptyString(data?.description)
      ?? (paid ? null : "Paystack reported that the renewal invoice is unpaid"),
  };
}

export function subscriptionIdentityMatches(
  incomingSubscriptionCode: string | null,
  activeSubscriptionCode: string | null,
): "match" | "unknown" | "conflict" {
  if (!incomingSubscriptionCode || !activeSubscriptionCode) return "unknown";
  return incomingSubscriptionCode === activeSubscriptionCode ? "match" : "conflict";
}

export function validateActivePaystackRenewalRelationship(
  subscriptionCode: string | null,
  customerCode: string | null,
  identity: {
    subscriptionCode: string;
    customerCode: string | null;
    status: string;
  } | null | undefined,
): ActivePaystackRenewalRelationshipResult {
  if (!identity) {
    return { valid: false, reason: "unknown_subscription_identity" };
  }
  if (identity.status !== "active") {
    return { valid: false, reason: "inactive_subscription_identity" };
  }
  const match = subscriptionIdentityMatches(subscriptionCode, identity.subscriptionCode);
  if (match !== "match") {
    return {
      valid: false,
      reason: match === "conflict"
        ? "stale_subscription_identity"
        : "unknown_subscription_identity",
    };
  }
  if (!customerCode || !identity.customerCode) {
    return { valid: false, reason: "subscription_customer_identity_missing" };
  }
  if (customerCode !== identity.customerCode) {
    return { valid: false, reason: "subscription_customer_mismatch" };
  }
  return { valid: true };
}

export function isViablePaystackSubscriptionCandidate(
  candidate: any,
  expectedCustomerCode: string,
  expectedPlanCode: string | null | undefined,
): boolean {
  const terminalStatuses = new Set(["cancelled", "complete", "disabled"]);
  const customerCode = extractPaystackCustomerCode(candidate)
    ?? asNonEmptyString(candidate?.customer);
  const planCode = asNonEmptyString(candidate?.plan?.plan_code)
    ?? asNonEmptyString(candidate?.plan_code)
    ?? (typeof candidate?.plan === "string" ? asNonEmptyString(candidate.plan) : null);
  const status = String(candidate?.status ?? "").toLowerCase();
  const subscriptionCode = extractPaystackSubscriptionCode(candidate);

  return !!subscriptionCode
    && customerCode === expectedCustomerCode
    && (!expectedPlanCode || planCode === expectedPlanCode)
    && !terminalStatuses.has(status);
}

export function selectPaystackSubscriptionIdentityCandidate(
  candidates: any[],
  expectedCustomerCode: string,
  expectedPlanCode: string | null | undefined,
): any | null {
  const matching = candidates.filter((candidate: any) =>
    isViablePaystackSubscriptionCandidate(candidate, expectedCustomerCode, expectedPlanCode),
  );

  // A recovery operation is allowed to establish trust only when Paystack
  // gives us one unambiguous relationship. Selecting the sole "active" row
  // from several plausible subscriptions would silently guess ownership.
  return matching.length === 1 ? matching[0] : null;
}

/**
 * Provider subscription details place invoices in several shapes. Keep this
 * extraction in one place so support sees the same "most recent" evidence
 * used by renewal reconciliation.
 */
export function getMostRecentPaystackInvoice(subscription: any): any | null {
  const invoices = [
    ...(subscription?.most_recent_invoice ? [subscription.most_recent_invoice] : []),
    ...(Array.isArray(subscription?.invoices_history) ? subscription.invoices_history : []),
    ...(Array.isArray(subscription?.invoices) ? subscription.invoices : []),
  ];
  invoices.sort((left: any, right: any) => {
    const leftDate = parsePaystackDate(
      left?.created_at ?? left?.createdAt ?? left?.paid_at ?? left?.paidAt ?? left?.period_start,
    )?.getTime() ?? 0;
    const rightDate = parsePaystackDate(
      right?.created_at ?? right?.createdAt ?? right?.paid_at ?? right?.paidAt ?? right?.period_start,
    )?.getTime() ?? 0;
    return rightDate - leftDate;
  });
  return invoices[0] ?? null;
}

export function paystackInvoiceFailureTransactionId(invoiceCode: string): string {
  return `paystack-invoice:${invoiceCode}`;
}

export function checkPaystackTransactionOwnership(
  transactionData: any,
  expected: {
    userId: number;
    email: string | null | undefined;
    customerCode: string | null | undefined;
  },
): { valid: boolean; reason: string } {
  const rawMetadataUserIds = [
    transactionData?.metadata?.user_id,
    transactionData?.subscription?.metadata?.user_id,
  ].filter((value) => value !== undefined && value !== null);
  const metadataUserIds = rawMetadataUserIds.map((value) => Number(value));
  const transactionEmails = [
    transactionData?.customer?.email,
    transactionData?.subscription?.customer?.email,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase());
  const expectedEmail = expected.email?.trim().toLowerCase() ?? null;
  const transactionCustomerCodes = [
    transactionData?.customer?.customer_code,
    transactionData?.customer_code,
    transactionData?.subscription?.customer?.customer_code,
    transactionData?.transaction?.customer?.customer_code,
  ]
    .map(asNonEmptyString)
    .filter((value): value is string => !!value);

  if (metadataUserIds.some(
    (metadataUserId) => !Number.isFinite(metadataUserId) || metadataUserId !== expected.userId,
  )) {
    return { valid: false, reason: "metadata_user_mismatch" };
  }
  if (transactionEmails.some(
    (transactionEmail) => !expectedEmail || transactionEmail !== expectedEmail,
  )) {
    return { valid: false, reason: "customer_email_mismatch" };
  }
  if (
    expected.customerCode
    && transactionCustomerCodes.some(
      (transactionCustomerCode) => transactionCustomerCode !== expected.customerCode,
    )
  ) {
    return { valid: false, reason: "customer_code_mismatch" };
  }

  const valid = metadataUserIds.includes(expected.userId)
    || transactionEmails.some(
      (transactionEmail) => !!expectedEmail && transactionEmail === expectedEmail,
    )
    || transactionCustomerCodes.some(
      (transactionCustomerCode) => !!expected.customerCode
        && transactionCustomerCode === expected.customerCode,
    );
  return valid
    ? { valid: true, reason: "ownership_confirmed" }
    : { valid: false, reason: "no_matching_customer_identifier" };
}

/**
 * Advance one billing interval while preserving the intended day of month.
 * JavaScript's setMonth would turn January 31 + 1 month into March; clamping
 * instead produces February 28/29, which is the expected calendar behavior.
 */
export function advanceBillingDate(
  base: Date,
  billingPeriod: "monthly" | "yearly",
): Date {
  const result = new Date(base);
  const intendedDay = result.getUTCDate();
  const targetYear = billingPeriod === "yearly"
    ? result.getUTCFullYear() + 1
    : result.getUTCFullYear();
  const targetMonth = billingPeriod === "monthly"
    ? result.getUTCMonth() + 1
    : result.getUTCMonth();

  result.setUTCDate(1);
  result.setUTCFullYear(targetYear, targetMonth, 1);
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(intendedDay, lastDay));
  return result;
}