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
    ?? asNonEmptyString(data?.customer_code);
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

export function selectPaystackSubscriptionIdentityCandidate(
  candidates: any[],
  expectedCustomerCode: string,
  expectedPlanCode: string | null | undefined,
): any | null {
  const terminalStatuses = new Set(["cancelled", "complete", "disabled"]);
  const matching = candidates.filter((candidate: any) => {
    const customerCode = extractPaystackCustomerCode(candidate)
      ?? asNonEmptyString(candidate?.customer);
    const planCode = asNonEmptyString(candidate?.plan?.plan_code)
      ?? asNonEmptyString(candidate?.plan_code);
    const status = String(candidate?.status ?? "").toLowerCase();
    return customerCode === expectedCustomerCode
      && (!expectedPlanCode || planCode === expectedPlanCode)
      && !terminalStatuses.has(status);
  });

  if (matching.length === 1) return matching[0];

  const active = matching.filter(
    (candidate: any) => String(candidate?.status ?? "").toLowerCase() === "active",
  );
  return active.length === 1 ? active[0] : null;
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
  const rawMetadataUserId = transactionData?.metadata?.user_id;
  const metadataUserId = rawMetadataUserId === undefined || rawMetadataUserId === null
    ? null
    : Number(rawMetadataUserId);
  const transactionEmail = typeof transactionData?.customer?.email === "string"
    ? transactionData.customer.email.trim().toLowerCase()
    : null;
  const expectedEmail = expected.email?.trim().toLowerCase() ?? null;
  const transactionCustomerCode = asNonEmptyString(transactionData?.customer?.customer_code);

  if (metadataUserId !== null
    && (!Number.isFinite(metadataUserId) || metadataUserId !== expected.userId)) {
    return { valid: false, reason: "metadata_user_mismatch" };
  }
  if (transactionEmail && expectedEmail && transactionEmail !== expectedEmail) {
    return { valid: false, reason: "customer_email_mismatch" };
  }

  const valid = metadataUserId === expected.userId
    || (!!transactionEmail && !!expectedEmail && transactionEmail === expectedEmail)
    || (!!transactionCustomerCode
      && !!expected.customerCode
      && transactionCustomerCode === expected.customerCode);
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